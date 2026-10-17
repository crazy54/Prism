using System.Reflection;
using System.Text.RegularExpressions;
using PrismControl.Core.Actions;
using PrismControl.Core.Layouts;
using PrismControl.Spotify.Actions;
using PrismControl.Testing;

namespace PrismControl.Spotify.Tests;

/// <summary>
/// Runs Core's discovery rules (<see cref="ActionValidator"/>, the code the host uses) on this module, so a bad attribute
/// fails here instead of at manifest generation; checks that every image an action names ships under plugin/imgs; and
/// that the custom PI page ships and stays offline.
/// </summary>
public partial class DiscoveryTests
{
    [GeneratedRegex(@"^com\.jeremyfhall\.prismcontrol(\.[a-z0-9-]+)+$")] private static partial Regex UuidRe();

    private static IEnumerable<(Type Type, StreamDeckActionAttribute Attr)> Actions() =>
        typeof(SpotifyModule).Assembly.GetTypes()
            .Select(t => (t, t.GetCustomAttribute<StreamDeckActionAttribute>(inherit: false)))
            .Where(x => x.Item2 is not null).Select(x => (x.t, x.Item2!));

    private static bool Derives(Type t, Type generic)
    {
        for (var c = t.BaseType; c is not null; c = c.BaseType)
            if (c.IsGenericType && c.GetGenericTypeDefinition() == generic) return true;
        return false;
    }

    [Test]
    public void Every_spotify_action_passes_the_discovery_rules()
    {
        var report = ActionValidator.Scan(typeof(SpotifyModule).Assembly);
        Assert.Empty(report.Errors, string.Join("; ", report.Errors));
        Assert.Empty(report.Warnings, string.Join("; ", report.Warnings));
        var actions = Actions().ToList();
        var uuids = actions.Select(a => a.Attr.Uuid).ToList();
        Assert.Equal(uuids.Count, uuids.Distinct().Count(), "duplicate UUIDs");
        string[] expected =
        [
            "com.jeremyfhall.prismcontrol.spotify.sample-now-playing", "com.jeremyfhall.prismcontrol.spotify.now-playing",
            "com.jeremyfhall.prismcontrol.spotify.play-pause", "com.jeremyfhall.prismcontrol.spotify.next", "com.jeremyfhall.prismcontrol.spotify.previous",
            "com.jeremyfhall.prismcontrol.spotify.like", "com.jeremyfhall.prismcontrol.spotify.shuffle", "com.jeremyfhall.prismcontrol.spotify.repeat",
            "com.jeremyfhall.prismcontrol.spotify.volume", "com.jeremyfhall.prismcontrol.spotify.browser",
        ];
        Assert.Equal(string.Join(",", expected.Order()), string.Join(",", uuids.Order()));
        foreach (var (t, a) in actions)
        {
            Assert.True(UuidRe().IsMatch(a.Uuid), a.Uuid);
            Assert.True(a.Uuid.StartsWith("com.jeremyfhall.prismcontrol.spotify.", StringComparison.Ordinal), a.Uuid);
            Assert.False(string.IsNullOrWhiteSpace(a.Name), t.Name);
            Assert.True(a.Name.Length <= 30, $"{a.Name} is longer than 30 characters");
            Assert.False(t.IsAbstract, t.Name);
            Assert.NotNull(t.GetConstructor(Type.EmptyTypes), t.Name + " needs a public parameterless constructor");
            if (a.Controllers.HasFlag(Controllers.Encoder))
            {
                Assert.True(Derives(t, typeof(DialAction<>)), t.Name + ": Encoder actions derive DialAction<T>");
                Assert.True(a.Layout is not null && Layouts.Shipped.Contains(a.Layout), t.Name + ": uses a shipped layout");
            }
            else Assert.True(Derives(t, typeof(KeyAction<>)), t.Name + ": Keypad actions derive KeyAction<T>");
            // The designer owns the images; whatever an action names must ship (as .svg or .png) under the module's plugin/.
            foreach (var (prop, image) in new[] { ("Icon", a.Icon), ("KeyImage", a.KeyImage), ("EncoderIcon", a.EncoderIcon) })
            {
                if (image is null) continue;
                Assert.True(image.StartsWith("imgs/actions/spotify/", StringComparison.Ordinal), $"{t.Name}.{prop} = {image}");
                var file = RepoFile(["src", "PrismControl.Spotify", "plugin", .. image.Split('/')]);
                Assert.True(File.Exists(file + ".svg") || File.Exists(file + ".png"), $"{t.Name}.{prop}: {image}.svg/.png is not under plugin/");
            }
            if (a.PropertyInspector is { } pi) Assert.Equal(SpotifyBinding.PiPage, pi);
            // Constructors do no work: creating an unbound instance must be harmless.
            Assert.NotNull(Activator.CreateInstance(t));
        }
    }

    /// <summary>
    /// The repo root: above the test exe (bin/ under the repo), else above the working directory (with --artifacts-path the
    /// exe sits outside the repo; run from prism-control/), like the core tests' Repo.Root.
    /// </summary>
    internal static string RepoRoot()
    {
        foreach (var start in new[] { AppContext.BaseDirectory, Directory.GetCurrentDirectory() })
            for (var d = new DirectoryInfo(start); d is not null; d = d.Parent)
                if (File.Exists(Path.Combine(d.FullName, "PrismControl.sln"))) return d.FullName;
        throw new InvalidOperationException($"PrismControl.sln not found above {AppContext.BaseDirectory} or {Directory.GetCurrentDirectory()} (run from prism-control/).");
    }

    private static string RepoFile(params string[] parts) => Path.Combine([RepoRoot(), .. parts]);

    [Test]
    public void The_pi_page_ships_with_the_module_and_loads_nothing_external()
    {
        var path = RepoFile("src", "PrismControl.Spotify", "plugin", "pi", "spotify.html");
        Assert.True(File.Exists(path), path);
        var html = File.ReadAllText(path);
        Assert.Contains("<script src=\"lib/prism-pi.js\"></script>", html);
        Assert.Contains("href=\"lib/prism-pi.css\"", html);
        Assert.False(Regex.IsMatch(html, @"(src|href)\s*=\s*""(https?:)?//", RegexOptions.IgnoreCase), "no external scripts, styles or images");
        Assert.Contains("Spotify Client ID", html);
        Assert.Contains("Connect Spotify", html);
        Assert.Contains("Disconnect", html);
        Assert.Contains("id=\"prism-form\"", html);
        Assert.DoesNotContain("data-setting=\"clientId\"", html, "the Client ID must not bind to action settings");
        foreach (Match m in Regex.Matches(html, "data-state=\"([a-zA-Z]+)\""))
            Assert.True(typeof(SpotifyBinding.PiStatus).GetProperty(char.ToUpperInvariant(m.Groups[1].Value[0]) + m.Groups[1].Value[1..]) is not null,
                $"data-state '{m.Groups[1].Value}' has no PiStatus property");
        Assert.True(File.Exists(RepoFile("pi", "lib", "prism-pi.js")), "the shared bridge the page uses");
    }
}
