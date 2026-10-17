using System.Reflection;
using PrismControl.Core.Actions;
using PrismControl.Core.Layouts;
using PrismControl.Core.Render;
using PrismControl.Testing;

namespace PrismControl.WinShell.Tests;

public class DiscoveryTests
{
    /// <summary>W1's actions. W2 adds theirs to <see cref="W2Prefixes"/>-style lists in their own test.</summary>
    public static readonly string[] W1Actions =
    [
        "browser", "desktops", "game-mode", "hdr", "input-source", "maximize", "monitor", "next-monitor", "placer", "refresh", "topmost", "window", "zone",
    ];

    private static List<(Type Type, StreamDeckActionAttribute Attr)> Actions() =>
        typeof(WinShellModule).Assembly.GetTypes()
            .Select(t => (t, a: t.GetCustomAttribute<StreamDeckActionAttribute>()))
            .Where(x => x.a is not null)
            .Select(x => (x.t, x.a!))
            .ToList();

    [Test]
    public void Every_action_passes_the_hosts_discovery_rules()
    {
        var scan = ActionValidator.Scan(typeof(WinShellModule).Assembly);
        Assert.Empty(scan.Errors);
        Assert.Empty(scan.Warnings);
        var mine = Actions().Where(a => W1Actions.Contains(a.Attr.Uuid["com.jeremyfhall.prismcontrol.windows.".Length..])).ToList();
        Assert.Equal(string.Join(",", W1Actions), string.Join(",", mine.Select(a => a.Attr.Uuid["com.jeremyfhall.prismcontrol.windows.".Length..]).Order(StringComparer.Ordinal)));
        foreach (var (t, a) in mine)
        {
            Assert.True(a.Uuid.StartsWith("com.jeremyfhall.prismcontrol.windows.", StringComparison.Ordinal), a.Uuid);
            Assert.True(a.Name.Length is > 0 and <= 30, $"{a.Uuid} name");
            Assert.NotNull(t.GetConstructor(Type.EmptyTypes), a.Uuid);
            var id = a.Uuid["com.jeremyfhall.prismcontrol.windows.".Length..];
            Assert.Equal($"imgs/actions/windows/{id}/icon", a.Icon, a.Uuid);
            Assert.Equal($"imgs/actions/windows/{id}/key", a.KeyImage, a.Uuid);
            if (a.Controllers.HasFlag(Controllers.Encoder))
            {
                Assert.Equal($"imgs/actions/windows/{id}/dial", a.EncoderIcon, a.Uuid);
                Assert.Equal(Layouts.Canvas.Path, a.Layout, a.Uuid);
                Assert.NotNull(a.TriggerRotate, a.Uuid);
                Assert.NotNull(a.TriggerPush, a.Uuid);
            }
            Assert.Empty(ActionValidator.Validate(t, a));
            Assert.NotNull(a.Tooltip, a.Uuid);
        }
    }

    [Test]
    public void Constructors_do_no_work()
    {
        foreach (var (t, _) in Actions()) Assert.NotNull(Activator.CreateInstance(t));
    }

    [Test]
    public void The_module_is_named_windows_and_the_namespace_never_shadows_winrt()
    {
        Assert.Equal("windows", new WinShellModule().Name);
        var bad = typeof(WinShellModule).Assembly.GetTypes().Select(t => t.Namespace ?? "").Where(n => n.Split('.').Contains("Windows")).Distinct().ToList();
        Assert.Empty(bad);
        Assert.NotNull(typeof(WinShellModule).Assembly.GetCustomAttribute<Core.Hosting.PrismModuleAttribute>());
    }

    [Test]
    public void Manifest_images_exist_are_qt_safe_and_match_the_runtime_glyphs()
    {
        var root = RepoRoot();
        if (root is null) { Assert.Skip("run from the prism-control folder to check the plugin images"); return; }
        foreach (var (id, glyph, encoder) in IconWriter.Actions())
        {
            var folder = Path.Combine(root, "src", "PrismControl.WinShell", "plugin", "imgs", "actions", "windows", id);
            foreach (var f in encoder ? new[] { "icon", "key", "dial" } : ["icon", "key"])
            {
                var path = Path.Combine(folder, f + ".svg");
                Assert.True(File.Exists(path), path);
                var svg = File.ReadAllText(path);
                var errors = SvgLint.Check(svg, f == "icon" ? SvgCanvas.Any : SvgCanvas.Key).Where(i => i.Severity == LintSeverity.Error).ToList();
                Assert.Empty(errors.Select(e => $"{id}/{f}: {e}"));
                var expected = f switch { "icon" => IconWriter.ListIcon(glyph), "key" => Shared.WinArt.GlyphKey(Core.Render.Tokens.Refraction.Night, glyph).ToSvg(), _ => IconWriter.DialIcon(glyph).ToSvg() };
                Assert.Equal(expected, svg, $"{id}/{f}.svg is stale: run the tests with -- --write-icons src/PrismControl.WinShell/plugin/imgs/actions/windows");
            }
        }
    }

    public static string? RepoRoot()
    {
        for (var d = new DirectoryInfo(Environment.CurrentDirectory); d is not null; d = d.Parent)
            if (File.Exists(Path.Combine(d.FullName, "PrismControl.sln"))) return d.FullName;
        return null;
    }
}
