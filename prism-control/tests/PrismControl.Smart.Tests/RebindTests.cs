using PrismControl.Smart.Packs;
using PrismControl.Smart.Rebinds;
using PrismControl.Testing;

namespace PrismControl.Smart.Tests;

/// <summary>A temporary folder tree standing in for %APPDATA% / %LOCALAPPDATA% / %USERPROFILE% (deleted after the test).</summary>
public sealed class TempHome : IDisposable
{
    public string Root { get; } = Path.Combine(Path.GetTempPath(), "prism-smart-tests", Guid.NewGuid().ToString("N"));
    public string AppData => Path.Combine(Root, "Roaming");
    public string LocalAppData => Path.Combine(Root, "Local");
    public string UserProfile => Path.Combine(Root, "Profile");

    public TempHome()
    {
        Directory.CreateDirectory(AppData);
        Directory.CreateDirectory(LocalAppData);
        Directory.CreateDirectory(UserProfile);
    }

    public RebindPaths Paths => new(name => name switch
    {
        "APPDATA" => AppData,
        "LOCALAPPDATA" => LocalAppData,
        "USERPROFILE" => UserProfile,
        _ => null,
    });

    public string Write(string relative, string text)
    {
        var p = Path.Combine(Root, relative);
        Directory.CreateDirectory(Path.GetDirectoryName(p)!);
        File.WriteAllText(p, text);
        return p;
    }

    public void Dispose()
    {
        try { Directory.Delete(Root, true); } catch { /* best effort */ }
    }
}

public class RebindTests
{
    [Test]
    public void VsCode_keybindings_rebind_and_unbind_by_command()
    {
        var set = new VsCodeKeybindingsAdapter().Parse("""
            // My keys (fictional)
            [
              { "key": "ctrl+alt+p", "command": "workbench.action.showCommands" },
              { "key": "ctrl+k ctrl+t", "command": "workbench.action.selectTheme", "when": "editorFocus" },
              { "key": "ctrl+shift+'", "command": "-workbench.action.terminal.new" },
              { "key": "[KeyB]", "command": "workbench.action.toggleSidebarVisibility", "when": "x" },
              { "key": "ctrl+b", "command": "workbench.action.toggleSidebarVisibility" },
            ]
            """, out var error);
        Assert.Null(error);
        Assert.Equal("Ctrl+Alt+P", set!.ByAction["workbench.action.showCommands"].Binding!.Describe());
        Assert.True(set.ByAction["workbench.action.selectTheme"].Binding is SequenceBinding { Steps.Count: 2 });
        Assert.True(set.ByAction["workbench.action.terminal.new"].IsUnbound);
        Assert.Equal("Ctrl+B", set.ByAction["workbench.action.toggleSidebarVisibility"].Binding!.Describe(), "an unconditional bind beats a when-clause one");
    }

    [Test]
    public void Windows_terminal_settings_rebind_by_action_id_and_unbind_keys()
    {
        var set = new WindowsTerminalSettingsAdapter().Parse("""
            {
              "actions": [ { "command": { "action": "splitPane", "split": "right" }, "id": "User.exampleSplit" } ],
              "keybindings": [
                { "keys": "ctrl+alt+shift+t", "id": "Terminal.OpenNewTab" },
                { "keys": ["alt+shift+plus", "ctrl+alt+r"], "id": "Terminal.DuplicatePaneRight" },
                { "keys": "ctrl+shift+k", "id": null },
                { "keys": "ctrl+alt+u", "id": "User.exampleSplit" }
              ]
            }
            """, out var error);
        Assert.Null(error);
        Assert.Equal("Ctrl+Alt+Shift+T", set!.ByAction["Terminal.OpenNewTab"].Binding!.Describe());
        Assert.Equal("Alt+Shift+Equal", set.ByAction["Terminal.DuplicatePaneRight"].Binding!.Describe());
        Assert.True(set.UnboundChords.Contains("Ctrl+Shift+K"));

        var wt = TestPacks.Get("windows-terminal");
        var applied = RebindAdapters.Apply(wt, set, out var n);
        Assert.True(n >= 3);
        Assert.Equal("Ctrl+Alt+Shift+T", applied.FindVerb("tab.new")!.Binding.Describe());
        Assert.Equal("Ctrl+Shift+T", applied.FindVerb("tab.new")!.ReboundFrom);
        Assert.True(applied.FindVerb("buffer.clear")!.Binding is UnboundBinding, "the user removed Ctrl+Shift+K");
    }

    [Test]
    public void Planet_coaster_controls_xml_maps_logical_buttons_and_empty_means_defaults()
    {
        var a = new FrontierControlsAdapter();
        var empty = a.Parse("<?xml version=\"1.0\" encoding=\"UTF-8\"?><Root><ControlBindings/></Root>", out var e0);
        Assert.Null(e0);
        Assert.Equal(0, empty!.Count);
        var set = a.Parse("""
            <Root><ControlBindings preset="Custom" version="1"><Bindings>
              <LogicalButton><Name>ExampleTorch</Name><Binding><DeviceType>Keyboard</DeviceType><Key>Input_KB_Key_K</Key></Binding></LogicalButton>
              <LogicalButton><Name>ExampleUndo</Name><Binding><DeviceType>Gamepad</DeviceType><Key>A</Key></Binding><Binding><DeviceType>Keyboard</DeviceType><Key>Z</Key><Modifier>LeftControl</Modifier><Modifier>Shift</Modifier></Binding></LogicalButton>
              <LogicalButton><Name>ExampleEquals</Name><Binding><Key>Equals</Key></Binding></LogicalButton>
            </Bindings></ControlBindings></Root>
            """, out var e1);
        Assert.Null(e1);
        Assert.Equal("K", set!.ByAction["ExampleTorch"].Binding!.Describe());
        Assert.Equal("Ctrl+Shift+Z", set.ByAction["ExampleUndo"].Binding!.Describe());
        Assert.Equal("Equal", set.ByAction["ExampleEquals"].Binding!.Describe());
        Assert.Null(a.Parse("<Root><ControlBindings>", out var bad));
        Assert.NotNull(bad);
    }

    [Test]
    public void The_service_finds_files_in_placeholder_folders_and_applies_them_read_only()
    {
        using var home = new TempHome();
        var file = home.Write(@"Local\Packages\Microsoft.WindowsTerminal_8wekyb3d8bbwe\LocalState\settings.json",
            """{ "keybindings": [ { "keys": "ctrl+alt+shift+t", "id": "Terminal.OpenNewTab" } ] }""");
        var before = File.GetLastWriteTimeUtc(file);
        using var svc = new RebindService(home.Paths, watch: false);
        var packs = svc.Apply([TestPacks.Get("windows-terminal"), TestPacks.Get("planet-coaster-2")]);
        Assert.Equal("Ctrl+Alt+Shift+T", packs[0].FindVerb("tab.new")!.Binding.Describe());
        var st = svc.Status.Single(s => s.PackId == "windows-terminal");
        Assert.Equal(1, st.Applied);
        Assert.Contains("%LOCALAPPDATA%", st.DisplayPath, "the PI never shows the user's real folder");
        Assert.Equal(before, File.GetLastWriteTimeUtc(file), "read-only");
        Assert.False(svc.Status.Single(s => s.PackId == "planet-coaster-2").Found);
    }

    [Test]
    public void Steam_id_placeholder_folders_resolve_to_the_newest_file()
    {
        using var home = new TempHome();
        home.Write(@"Profile\Saved Games\Frontier Developments\Planet Coaster 2\00000001\Config\Controls_remote.config.xml", "<Root><ControlBindings/></Root>");
        var paths = home.Paths.Resolve(@"%USERPROFILE%\Saved Games\Frontier Developments\Planet Coaster 2\<steam-id>\Config\Controls_remote.config.xml");
        Assert.Single(paths);
        using var svc = new RebindService(home.Paths, watch: false);
        svc.Apply([TestPacks.Get("planet-coaster-2")]);
        var st = svc.Status.Single();
        Assert.True(st.Found);
        Assert.Null(st.Error);
        Assert.Equal(0, st.Entries);
    }

    [Test]
    public void An_unparseable_file_keeps_the_defaults_and_says_so()
    {
        using var home = new TempHome();
        home.Write(@"Roaming\Code\User\keybindings.json", "[ { this is not json ");
        using var svc = new RebindService(home.Paths, watch: false);
        var vs = TestPacks.Get("vscode");
        var result = svc.Apply([vs])[0];
        AssertExtra.Equal(vs.Verbs.Select(v => v.Binding.Describe()), result.Verbs.Select(v => v.Binding.Describe()));
        var st = svc.Status.Single();
        Assert.NotNull(st.Error);
    }

    [Test]
    public void Never_read_files_are_never_opened()
    {
        var discord = TestPacks.Get("discord");
        Assert.True(discord.UserBindings.NeverRead);
        using var home = new TempHome();
        using var svc = new RebindService(home.Paths, watch: false);
        svc.Apply([discord]);
        Assert.Contains("not read on purpose", svc.Status.Single().Error);
    }
}

internal static class AssertExtra
{
    public static void Equal(IEnumerable<string> expected, IEnumerable<string> actual) =>
        Assert.Equal(string.Join("|", expected), string.Join("|", actual));
}
