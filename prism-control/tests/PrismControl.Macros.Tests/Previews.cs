using System.Text;
using PrismControl.Core.Actions;
using PrismControl.Core.Devices;
using PrismControl.Core.Layouts;
using PrismControl.Core.Render;
using PrismControl.Core.Render.Tokens;
using PrismControl.Macros.Actions;
using PrismControl.Macros.Art;
using PrismControl.Macros.Engine;
using PrismControl.Testing;

namespace PrismControl.Macros.Tests;

/// <summary>
/// <c>dotnet run --project tests/PrismControl.Macros.Tests -- --render-previews &lt;dir&gt;</c>: the real frames of every
/// macro action (rendered through the harness with fakes: nothing is sent or launched), Night and Day, plus index.html with
/// keys at 72/96/120/144 px and dials at 200×100 (Stream Deck + strip) and 360×180 (Galleon widget).
/// </summary>
public static class MacroPreviews
{
    public static int Write(string dir) => WriteAsync(dir).GetAwaiter().GetResult();

    private static async Task<int> WriteAsync(string dir)
    {
        Directory.CreateDirectory(dir);
        var keys = new List<(string Name, string Svg)>();
        var dials = new List<(string Name, string Svg)>();
        foreach (var theme in new[] { "night", "day" })
        {
            var t = Themes.Resolve(theme);
            async Task Key<T>(string name, object? settings, bool trusted = true) where T : ActionBase, new()
            {
                var rig = new TestRig();
                // The normal faces assume the launches were set up on this PC; "trusted: false" shows the review face.
                if (trusted && settings is MacroKeySettings m) { rig.Trusted(m.Macro); rig.Trusted(m.LongMacro); }
                if (trusted && settings is LaunchSettings l && !string.IsNullOrWhiteSpace(l.Target))
                    rig.Trust.Trust(LaunchPolicy.Resolve(l.Target, l.Arguments, l.WorkingDirectory));
                await using var h = await rig.AppearAsync<T>(TestDevices.Galleon, new(0, 0), settings, theme: theme);
                keys.Add(($"{theme}-{name}", h.LastSvg ?? throw new InvalidOperationException(name + " drew nothing")));
            }
            async Task Dial(string name, MacroDialSettings? settings, int rotate = 0)
            {
                var rig = new TestRig();
                await using var h = await rig.AppearAsync<MacroDial>(TestDevices.Galleon, new(0, 0), settings, Controller.Encoder, theme);
                if (rotate != 0)
                {
                    await h.AdvanceAsync(TimeSpan.FromSeconds(1)); // start away from t=0, like a real session
                    await h.RotateAsync(rotate); // the frame drawn while it turns (lit row)
                }
                dials.Add(($"{theme}-{name}", h.FeedbackSvg(Layouts.Canvas.Frame) ?? throw new InvalidOperationException(name + " drew nothing")));
            }

            await Key<MacroKey>("macro-unset", null);
            await Key<MacroKey>("macro-steps", new MacroKeySettings { Macro = SerializationTests.AllSteps() });
            await Key<MacroKey>("macro-label", new MacroKeySettings { Label = "Deploy", Macro = MacroScript.Of(new ChordStep("Ctrl+S")) });
            keys.Add(($"{theme}-macro-running-a", MacroArt.Running(t, "Deploy", 1, 5, beat: true).ToSvg()));
            keys.Add(($"{theme}-macro-running-b", MacroArt.Running(t, "Deploy", 1, 5, beat: false).ToSvg()));
            await Key<HotkeyKey>("hotkey-unset", null);
            await Key<HotkeyKey>("hotkey-ctrl-shift-t", new HotkeySettings { Chord = "Ctrl+Shift+T" });
            await Key<HotkeyKey>("hotkey-labelled", new HotkeySettings { Chord = "Win+Shift+S", Label = "Snip" });
            await Key<HotkeyKey>("hotkey-long", new HotkeySettings { Chord = "Ctrl+Alt+PageDown" });
            await Key<HotkeyKey>("hotkey-win", new HotkeySettings { Chord = "Win" });
            await Key<HotkeyKey>("hotkey-f13", new HotkeySettings { Chord = "F13" });
            await Key<TypeTextKey>("text-unset", null);
            await Key<TypeTextKey>("text", new TypeTextSettings { Text = "Thanks, The Example Ensemble!\n" });
            await Key<LaunchKey>("launch-unset", null);
            await Key<LaunchKey>("launch-app", new LaunchSettings { Target = @"C:\Windows\notepad.exe" });
            await Key<LaunchKey>("launch-url", new LaunchSettings { Target = "https://www.example.com/status" });
            // Faces that ask for the user: an imported launch to review, a step to fix, a launch that always asks first.
            await Key<LaunchKey>("launch-review", new LaunchSettings { Target = @"C:\Tools\Example\example.exe" }, trusted: false);
            await Key<MacroKey>("macro-fix", System.Text.Json.Nodes.JsonNode.Parse("""{"macro":{"version":1,"steps":[{"type":"text","text":null}]}}"""));
            keys.Add(($"{theme}-launch-confirm", MacroArt.Notice(t, NoticeKind.Confirm, "cmd.exe").ToSvg()));
            await Key<HotkeyKey>("hotkey-check-keys", new HotkeySettings { Chord = "Ctrl+Bogus" });
            await Key<MediaKeyAction>("media-unset", null);
            foreach (var k in Enum.GetValues<MediaKey>())
                await Key<MediaKeyAction>("media-" + MediaKeys.Value(k), new MediaKeySettings { Key = MediaKeys.Value(k) });

            await Dial("dial-unset", null);
            await Dial("dial-review", new MacroDialSettings { Label = "Tools", Right = new ChordStep("Ctrl+Tab"), Push = MacroScript.Of(new LaunchStep { Target = @"C:\Tools\Example\example.exe" }) });
            var zoom = DialPresets.All.Single(p => p.Id == "zoom");
            var zoomSettings = new MacroDialSettings { Label = zoom.Short, Right = zoom.Right, Left = zoom.Left, Push = zoom.Push };
            await Dial("dial-zoom", zoomSettings);
            await Dial("dial-zoom-turning-right", zoomSettings, rotate: 2);
            var vol = DialPresets.All.Single(p => p.Id == "volume");
            await Dial("dial-volume-turning-left", new MacroDialSettings { Label = vol.Short, Right = vol.Right, Left = vol.Left, Push = vol.Push }, rotate: -1);
            var tabs = DialPresets.All.Single(p => p.Id == "tabs");
            await Dial("dial-tabs", new MacroDialSettings { Label = tabs.Short, Right = tabs.Right, Left = tabs.Left, Push = tabs.Push });
        }

        WritePiFixture(dir);
        foreach (var (name, svg) in keys) Save(dir, "key-" + name, svg, SvgCanvas.Key);
        foreach (var (name, svg) in dials) Save(dir, "dial-" + name, svg, SvgCanvas.Dial);

        var html = new StringBuilder();
        html.Append("<!doctype html><html><head><meta charset=\"utf-8\"><style>body{margin:20px;background:#000;color:#a2a4b4;font:12px Segoe UI,sans-serif}")
            .Append("h2{color:#f0f0f5;font-size:14px;margin:16px 0 6px}.row{display:flex;gap:14px;align-items:flex-end;flex-wrap:wrap;margin-bottom:6px}")
            .Append("figure{margin:0;text-align:center}figcaption{margin-top:3px}img{display:block}.day{background:#e9e9ef;padding:8px;border-radius:6px}</style></head><body>");
        foreach (var theme in new[] { "night", "day" })
        {
            html.Append($"<h2>{theme}: keys at 72 / 96 / 120 / 144 px</h2>");
            foreach (var (name, _) in keys.Where(k => k.Name.StartsWith(theme + "-", StringComparison.Ordinal)))
            {
                html.Append($"<div class=\"row{(theme == "day" ? " day" : "")}\">");
                foreach (var px in new[] { 72, 96, 120, 144 })
                    html.Append($"<figure><img src=\"key-{name}.svg\" width=\"{px}\" height=\"{px}\"><figcaption>{name[(theme.Length + 1)..]} {px}</figcaption></figure>");
                html.Append("</div>");
            }
            html.Append($"<h2>{theme}: dials at 200×100 (Stream Deck + strip) and 360×180 (Galleon widget)</h2>");
            foreach (var (name, _) in dials.Where(k => k.Name.StartsWith(theme + "-", StringComparison.Ordinal)))
                html.Append($"<div class=\"row{(theme == "day" ? " day" : "")}\"><figure><img src=\"dial-{name}.svg\" width=\"200\" height=\"100\"><figcaption>{name[(theme.Length + 1)..]} 200×100</figcaption></figure>")
                    .Append($"<figure><img src=\"dial-{name}.svg\" width=\"360\" height=\"180\"><figcaption>360×180</figcaption></figure></div>");
        }
        html.Append("</body></html>");
        File.WriteAllText(Path.Combine(dir, "index.html"), html.ToString());
        Console.WriteLine($"wrote {keys.Count} keys, {dials.Count} dials and index.html to {Path.GetFullPath(dir)}");
        return 0;
    }

    /// <summary>pi-fixture.json: the real catalog plus sample settings and describe answers, for a PI smoke test in a browser.</summary>
    private static void WritePiFixture(string dir)
    {
        var macro = new MacroKeySettings
        {
            Label = "Deploy",
            Macro = MacroScript.Of(new ChordStep("Ctrl+Shift+T"), new DelayStep(250), new TextStep("Hello, The Example Ensemble"), new ChordStep("Ctrl+Bogus")),
            LongMacro = MacroScript.Of(new OpenUrlStep("https://example.com/status")),
        };
        var zoom = DialPresets.All.Single(p => p.Id == "zoom");
        var dial = new MacroDialSettings { Label = "Zoom", Right = zoom.Right, Left = zoom.Left, Push = zoom.Push, TicksPerStep = 2 };
        var settings = new System.Text.Json.Nodes.JsonObject
        {
            ["macro"] = System.Text.Json.JsonSerializer.SerializeToNode(macro, ActionJson.Options),
            ["hotkey"] = System.Text.Json.JsonSerializer.SerializeToNode(new HotkeySettings { Chord = "Ctrl+Shift+T", Label = "Reopen" }, ActionJson.Options),
            ["type-text"] = System.Text.Json.JsonSerializer.SerializeToNode(new TypeTextSettings { Text = "Hello," + Environment.NewLine + "The Example Ensemble" }, ActionJson.Options),
            ["dial"] = System.Text.Json.JsonSerializer.SerializeToNode(dial, ActionJson.Options),
        };
        var describe = MacroPi.Describe(new System.Text.Json.Nodes.JsonObject
        {
            ["scripts"] = new System.Text.Json.Nodes.JsonObject { ["macro"] = macro.Macro.ToJson(), ["longMacro"] = macro.LongMacro.ToJson(), ["push"] = dial.Push.ToJson() },
            ["steps"] = new System.Text.Json.Nodes.JsonObject { ["right"] = MacroJson.WriteStep(dial.Right!), ["left"] = MacroJson.WriteStep(dial.Left!) },
            ["chords"] = new System.Text.Json.Nodes.JsonObject { ["chord"] = "Ctrl+Shift+T" },
        });
        var fixture = new System.Text.Json.Nodes.JsonObject { ["catalog"] = MacroPi.Catalog(), ["settings"] = settings, ["describe"] = describe };
        File.WriteAllText(Path.Combine(dir, "pi-fixture.json"), fixture.ToJsonString());
    }

    private static void Save(string dir, string name, string svg, SvgCanvas canvas)
    {
        var issues = SvgLint.Check(svg, canvas);
        var errors = issues.Where(i => i.Severity == LintSeverity.Error).ToList();
        if (errors.Count > 0) throw new InvalidOperationException($"{name}: " + string.Join("; ", errors));
        var count = System.Text.RegularExpressions.Regex.Matches(svg, "<(?!/)(?!svg)(?!defs)[a-zA-Z]").Count;
        if (count > 120) Console.WriteLine($"  note: {name} has ~{count} elements");
        File.WriteAllText(Path.Combine(dir, name + ".svg"), svg);
    }
}
