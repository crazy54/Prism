using System.Net;
using System.Text;
using PrismControl.Core.Devices;
using PrismControl.Core.Render;
using PrismControl.Core.Render.Tokens;
using PrismControl.Desktop;
using PrismControl.Smart.Art;
using PrismControl.Smart.Context;
using PrismControl.Smart.Layout;
using PrismControl.Smart.Runtime;
using PrismControl.Testing;

namespace PrismControl.Smart.Tests;

/// <summary>
/// <c>--render-previews &lt;dir&gt;</c>: whole generated decks (Galleon 100 SD, Stream Deck +, XL) straight from the engine:
/// Planet Coaster 2 (track builder + park), Chrome, VS Code and Windows Terminal, plus a sheet of slot states. One HTML
/// page per scenario (Night) + a Day page, keys and widgets at their on-device sizes.
/// </summary>
public static class SmartPreviews
{
    private static readonly DeviceInfo Xl = TestDevices.XL;

    private sealed record Scenario(string Id, string Title, ForegroundApp App, Action<Rig> Setup, string Note, IReadOnlyList<Packs.ContextPack>? Packs = null);

    /// <summary>Planet Coaster (1), fictional handles: the smart-fix polish (PC1 builder widgets, the RATINGS key).</summary>
    private static readonly ForegroundApp PlanetCoaster1 = new(0x1101, 4111, "PlanetCoaster.exe", @"E:\Games\Example\Planet Coaster\PlanetCoaster.exe", "Planet Coaster", null, "Cobra", false);

    /// <summary>VS Code with an assistant's proposal waiting (REVIEW) and one the user approved (AI): the shipped packs + an AI override file.</summary>
    private static IReadOnlyList<Packs.ContextPack> AiReviewPacks()
    {
        var lib = new Packs.PackLibrary(() => Packs.PackLibrary.Embedded().Append(new Packs.PackSourceFile("user:vscode.ai.json", Packs.PackOrigin.User, """
            { "id": "vscode", "verbs": [
              { "id": "general.quickOpen", "pendingBinding": { "kind": "chord", "chord": "Ctrl+Alt+F12", "client": "Example Assistant", "at": "2026-10-17T03:00:00.000Z" } },
              { "id": "terminal.toggle", "binding": { "kind": "chord", "chord": "Ctrl+Alt+T" }, "safety": "confirm", "aiBound": true } ] }
            """)));
        lib.Reload();
        return lib.Packs;
    }

    public static async Task<int> WriteAsync(string dir)
    {
        Directory.CreateDirectory(dir);
        var scenarios = new List<Scenario>
        {
            new("pc2-builder", "Planet Coaster 2 · track builder (the Coaster Console)", Apps.PlanetCoaster2, BuilderSight, "Prism Sight sees the track editor: bank −12°, pitch 18°, curve 0°, ride ratings."),
            new("pc2-park", "Planet Coaster 2 · park", Apps.PlanetCoaster2, ParkSight, "Default context; the HUD readouts come from Prism Sight."),
            new("chrome", "Chrome (no browser extension connected)", Apps.Chrome, _ => { }, "Module verbs show their unavailable faces until the Prism browser module answers."),
            new("vscode", "VS Code · editor", Apps.VsCode, _ => { }, "Pack defaults (no keybindings.json on this PC)."),
            new("terminal", "Windows Terminal", Apps.Terminal, _ => { }, "Pack defaults; the tab title readout is streamer-hide."),
            new("pc1-builder", "Planet Coaster · track builder (PC1 Coaster Console)", PlanetCoaster1, Pc1Sight, "Each widget shows its own dial (bank −8°; pitch, curve and length unconfirmed in PC1: NO READING); E/F/N is the RATINGS key."),
            new("vscode-ai", "VS Code · an AI proposal waiting (REVIEW) and an approved AI key", Apps.VsCode, _ => { }, "QUICK OPEN: an assistant proposed Ctrl+Alt+F12 (nothing runs until you hold it 1.5 s or approve in the PI). TERMINAL: an approved AI key (AI badge, hold to confirm).", AiReviewPacks()),
        };
        var pages = new List<(string File, string Title)>();
        foreach (var sc in scenarios)
        {
            var html = await ScenarioPageAsync(sc, Refraction.Night);
            var file = $"{sc.Id}.html";
            await File.WriteAllTextAsync(Path.Combine(dir, file), html);
            pages.Add((file, sc.Title));
        }
        await File.WriteAllTextAsync(Path.Combine(dir, "pc2-builder-day.html"), await ScenarioPageAsync(scenarios[0], Refraction.Day));
        pages.Add(("pc2-builder-day.html", scenarios[0].Title + " (Day)"));
        await File.WriteAllTextAsync(Path.Combine(dir, "states.html"), await StatesPageAsync(Refraction.Night));
        pages.Add(("states.html", "Slot states"));
        var index = new StringBuilder(Head("Prism Smart Deck previews", Refraction.Night));
        index.Append("<h1>Prism Smart Deck · generated decks</h1><ul>");
        foreach (var (f, t) in pages) index.Append($"<li><a href=\"{f}\">{WebUtility.HtmlEncode(t)}</a></li>");
        index.Append("</ul></body></html>");
        await File.WriteAllTextAsync(Path.Combine(dir, "index.html"), index.ToString());
        Console.WriteLine($"wrote {pages.Count} preview pages to {Path.GetFullPath(dir)}");
        return 0;
    }

    private static void BuilderSight(Rig rig)
    {
        Pc2.Builder(rig, bank: -12);
        var s = rig.SightFake;
        s.Values[Pc2.ReadoutRegion("slopeAngle")] = 18;
        s.Values[Pc2.ReadoutRegion("pieceLength")] = 24;
        s.Publish();
    }

    private static void Pc1Sight(Rig rig)
    {
        var s = rig.SightFake;
        s.Visible.Clear();
        s.Visible.Add("pc1.builder.editPanel");
        s.Values["pc1.builder.bankValue"] = -8;
        s.Values["pc1.test.ratings.excitement"] = 6.4;
        s.Values["pc1.test.ratings.fear"] = 4.9;
        s.Values["pc1.test.ratings.nausea"] = 2.7;
        // The editor's handles and buttons are on screen (not the other contexts' panels: that would be another context).
        var pc1 = TestPacks.Get("planet-coaster");
        var panels = pc1.Contexts.SelectMany(c => c.Detect.Detectors).Select(d => d.Region).OfType<string>().ToHashSet();
        foreach (var r in pc1.SightRegions) if (!panels.Contains(r.Id)) s.Located.Add(r.Id);
        s.Publish();
    }

    private static void ParkSight(Rig rig)
    {
        var s = rig.SightFake;
        s.Values["pc2.hud.cash"] = 48250;
        s.Values["pc2.hud.guests"] = 1312;
        s.Values["pc2.hud.parkRating"] = 76;
        s.Publish();
    }

    private static async Task<string> ScenarioPageAsync(Scenario sc, RefractionPalette t)
    {
        using var rig = new Rig(sc.Packs);
        sc.Setup(rig);
        await rig.FrontAsync(sc.App);
        var sb = new StringBuilder(Head(sc.Title, t));
        var state = rig.Engine.Context.Current;
        sb.Append($"<h1>{WebUtility.HtmlEncode(sc.Title)}</h1><p class=note>{WebUtility.HtmlEncode(sc.Note)} Context: <b>{WebUtility.HtmlEncode(state.ToString())}</b>.</p>");
        sb.Append("<div class=row>");
        sb.Append(Device(rig, TestDevices.Galleon, t, "Corsair Galleon 100 SD"));
        sb.Append(Device(rig, TestDevices.Plus, t, "Stream Deck +"));
        sb.Append("</div><div class=row>");
        sb.Append(Device(rig, Xl, t, "Stream Deck XL"));
        sb.Append("</div></body></html>");
        await Task.CompletedTask;
        return sb.ToString();
    }

    private static string Device(Rig rig, DeviceInfo device, RefractionPalette t, string title)
    {
        var geo = DeviceGeometry.For(device);
        var slots = new Dictionary<string, SmartSlot>();
        foreach (var k in geo.AllKeys()) slots["k" + k] = rig.Engine.Attach($"{device.Id}-{k}", device, Controller.Keypad, new Coordinates(k.X, k.Y), () => { });
        foreach (var d in geo.AllDials()) slots["d" + d] = rig.Engine.Attach($"{device.Id}-{d}", device, Controller.Encoder, geo.Layers > 1 ? new Coordinates(d.Dial, d.Layer) : new Coordinates(d.Dial, 0), () => { });
        rig.Engine.RegenerateAll("preview");
        var layout = rig.Engine.LayoutFor(device.Id);
        var keyPx = device.IsGalleon ? 96 : device.IsPlus ? 96 : 80;
        var sb = new StringBuilder($"<section class=dev><h2>{WebUtility.HtmlEncode(title)} <small>{layout.PackId}/{layout.ContextId} · page {layout.Page + 1}/{layout.PageCount}</small></h2><div class=devbody>");
        sb.Append($"<div class=keys style=\"grid-template-columns:repeat({geo.Columns},{keyPx}px)\">");
        foreach (var k in geo.AllKeys())
        {
            var view = rig.Engine.View(slots["k" + k]);
            var svg = SmartArt.Key(t, view);
            Check(svg);
            sb.Append($"<img class=key width={keyPx} height={keyPx} src=\"{svg.ToDataUri()}\" title=\"{WebUtility.HtmlEncode(k + " " + view.Why)}\">");
        }
        sb.Append("</div>");
        if (geo.HasScreens)
        {
            var w = device.IsGalleon ? 300 : 200;
            var h = w / 2;
            if (device.IsGalleon)
            {
                sb.Append("<div class=screen>");
                foreach (var (dial, layer) in new[] { (0, 0), (1, 0), (0, 1), (1, 1) })
                {
                    var view = rig.Engine.View(slots["d" + new DialSlot(dial, layer)]);
                    var svg = SmartArt.Dial(t, view);
                    Check(svg);
                    sb.Append($"<img width={w} height={h} src=\"{svg.ToDataUri()}\" title=\"{WebUtility.HtmlEncode(view.Why)}\">");
                }
                sb.Append("<div class=cap>screen: TL/TR = layer 0 (left/right dial), BL/BR = layer 1</div></div>");
            }
            else
            {
                sb.Append("<div class=strip>");
                foreach (var d in geo.AllDials())
                {
                    var view = rig.Engine.View(slots["d" + d]);
                    var svg = SmartArt.Dial(t, view);
                    Check(svg);
                    sb.Append($"<img width={w} height={h} src=\"{svg.ToDataUri()}\" title=\"{WebUtility.HtmlEncode(view.Why)}\">");
                }
                sb.Append("</div>");
            }
        }
        sb.Append("</div></section>");
        foreach (var s in slots.Values) rig.Engine.Detach(s);
        return sb.ToString();
    }

    private static async Task<string> StatesPageAsync(RefractionPalette t)
    {
        var sb = new StringBuilder(Head("Smart slot states", t));
        sb.Append("<h1>Smart slot states</h1><div class=sheet>");
        void Key(string caption, SlotView v)
        {
            var svg = SmartArt.Key(t, v);
            Check(svg);
            sb.Append($"<figure><img width=120 height=120 src=\"{svg.ToDataUri()}\"><figcaption>{WebUtility.HtmlEncode(caption)}</figcaption></figure>");
        }
        void Dial(string caption, SlotView v)
        {
            var svg = SmartArt.Dial(t, v);
            Check(svg);
            sb.Append($"<figure class=wide><img width=300 height=150 src=\"{svg.ToDataUri()}\"><figcaption>{WebUtility.HtmlEncode(caption)}</figcaption></figure>");
        }
        var hue = SmartEngine.HueFor("planet-coaster-2");
        var baseV = new SlotView { Kind = SlotKind.Verb, Label = "UNDO", Glyph = "back", Hue = hue };
        Key("ready (glyph)", baseV);
        Key("monogram tile (no glyph)", baseV with { Label = "WARP DRIVE", Glyph = "no-such-glyph-warp", Monogram = "WD" });
        Key("label: large", baseV with { LabelSize = "large" });
        Key("label: none + big icons", baseV with { LabelSize = "none", BigIcons = true });
        Key("not in front", baseV with { Availability = new SlotAvailability(false, "notForeground", "PC2", "Planet Coaster 2 isn't in front.", "dim") });
        Key("sight lost", baseV with { Label = "LOOPS", Glyph = "loop", Monogram = "LP", Availability = new SlotAvailability(false, "sightLost", "LOOPS", "Needs Prism Sight", "dim") });
        Key("unbound (bind me)", baseV with { Label = "ZOOM PANE", Glyph = "target", Availability = new SlotAvailability(false, "unbound", "BIND ME", "x", "dim") });
        Key("admin app", baseV with { Availability = new SlotAvailability(false, "elevated", "ADMIN", "x", "dim") });
        Key("toggle on (observed)", baseV with { Label = "ANGLE SNAP", Glyph = "target", IsToggle = true, On = true, StateConfidence = Desktop.ReadoutConfidence.Observed });
        Key("toggle off (inferred)", baseV with { Label = "ANGLE SNAP", Glyph = "target", IsToggle = true, On = false, StateConfidence = Desktop.ReadoutConfidence.Inferred });
        Key("toggle unknown", baseV with { Label = "ON TOP", Glyph = "lock", IsToggle = true, On = null });
        Key("value badge (speed)", baseV with { Label = "PAUSE", Glyph = "pause", Badge = "2x", StateConfidence = Desktop.ReadoutConfidence.Observed });
        Key("alias: eye-off (toggle on)", baseV with { Label = "HIDE UI", Glyph = "eye-off", IsToggle = true, On = true, StateConfidence = Desktop.ReadoutConfidence.Observed });
        Key("confirm (dashed ring)", baseV with { Label = "CLOSE PANE", Glyph = "power", Safety = Packs.Safety.Confirm });
        Key("confirm: holding 60%", baseV with { Label = "CLOSE PANE", Glyph = "power", Safety = Packs.Safety.Confirm, HoldProgress = 0.6 });
        Key("flash: NOT IN FRONT", baseV with { Flash = "NOT IN FRONT", FlashIsError = true });
        Key("flash: DONE", baseV with { Flash = "DONE" });
        // smart-fix: AI proposals (REVIEW), approved AI keys, taken keys and the new refusals.
        Key("AI proposal: REVIEW", baseV with { Label = "QUICK OPEN", Glyph = "search", Review = "Ctrl+Alt+F12" });
        Key("REVIEW: holding 55% (shows the new key)", baseV with { Label = "QUICK OPEN", Glyph = "search", Review = "Ctrl+Alt+F12", ReviewProgress = 0.55 });
        Key("approved AI key (AI, hold to confirm)", baseV with { Label = "TERMINAL", Glyph = "terminal", AiBound = true, Safety = Packs.Safety.Confirm });
        Key("key taken by your own binds", baseV with { Label = "QUICK OPEN", Glyph = "search", Availability = new SlotAvailability(false, "unbound", "KEY TAKEN", "x", "dim") });
        Key("flash: WINDOW CHANGED", baseV with { Flash = "WINDOW CHANGED", FlashIsError = true });
        Key("flash: PAGE CHANGED", baseV with { Flash = "PAGE CHANGED", FlashIsError = true });
        Key("flash: HOLD TO OK", baseV with { Label = "QUICK OPEN", Glyph = "search", Review = "Ctrl+Alt+F12", Flash = "HOLD TO OK" });
        Key("more 2/5", new SlotView { Kind = SlotKind.More, Hue = hue, Badge = "2/5", Page = 1, PageCount = 5 });
        Key("more, locked", new SlotView { Kind = SlotKind.More, Hue = hue, Badge = "1/5", Locked = true });
        Key("lock key", new SlotView { Kind = SlotKind.Lock, Label = "LOCK", Hue = hue });
        Key("idle: no pack", new SlotView { Kind = SlotKind.Idle, Label = "NO PACK" });
        Key("empty smart slot", new SlotView { Kind = SlotKind.Empty, Hue = hue });
        sb.Append("</div><div class=sheet>");

        // Dials with real readouts from the resolver (observed, inferred, stale, unknown).
        using var rig = new Rig();
        BuilderSight(rig);
        await rig.FrontAsync(Apps.PlanetCoaster2);
        await rig.AdvanceAsync(500);
        var slot = rig.Engine.Attach("states-d", TestDevices.Galleon, Controller.Encoder, new Coordinates(0, 0), () => { });
        rig.Engine.RegenerateAll("states");
        var bank = rig.Engine.View(slot);
        Dial("bank: observed −12° (horizon)", bank);
        Dial("bank: armed confirm push", bank with { Armed = true, ArmedSecondsLeft = 2.4, PushLabel = "LEVEL" });
        Dial("bank: flash LEVEL", bank with { Flash = "LEVEL" });
        Dial("bank: push verb in REVIEW", bank with { Review = "Ctrl+Alt+L" });
        Dial("bank: flash WINDOW CHANGED", bank with { Flash = "WINDOW CHANGED", FlashIsError = true });
        Dial("bank: sight lost", bank with { Availability = new SlotAvailability(false, "sightLost", "BANK", "Needs Prism Sight on the track editor.", "dim") });
        rig.Time.Advance(TimeSpan.FromSeconds(10));
        Dial("bank: stale reading", rig.Engine.View(slot));
        rig.SightFake.Values.Remove(Pc2.ReadoutRegion("bankAngle"));
        rig.SightFake.Publish();
        Dial("bank: no reading", rig.Engine.View(slot));
        sb.Append("</div></body></html>");
        return sb.ToString();
    }

    /// <summary>The manifest's default images: what a smart slot shows before the plugin draws it.</summary>
    public static int WriteIcons(string dir)
    {
        var t = Refraction.Night;
        var key = SmartArt.Key(t, new SlotView { Kind = SlotKind.Verb, Label = "SMART", Glyph = "target", Hue = 5 });
        // The Smart Dial's key image must be square (the manifest's 72×72 / 144 States image, review M1); its 200×100 art
        // is the encoder background only.
        var dialKey = SmartArt.Key(t, new SlotView { Kind = SlotKind.Verb, Label = "SMART DIAL", Glyph = "rotate", Hue = 5 });
        var dial = SmartArt.Dial(t, new SlotView { Kind = SlotKind.Idle, Label = "SMART DIAL" });
        Check(key);
        Check(dialKey);
        Check(dial);
        foreach (var (id, file, svg) in new[] { ("key", "key.svg", key), ("dial", "key.svg", dialKey), ("dial", "background.svg", dial) })
        {
            var d = Path.Combine(dir, id);
            Directory.CreateDirectory(d);
            File.WriteAllText(Path.Combine(d, file), svg.ToSvg());
        }
        Console.WriteLine("wrote key images to " + Path.GetFullPath(dir));
        return 0;
    }

    private static void Check(SvgDocument d)
    {
        var errs = SvgLint.Check(d.ToSvg(), SvgCanvas.Any).Where(i => i.Severity == LintSeverity.Error).ToList();
        if (errs.Count > 0) throw new InvalidOperationException("preview frame is not deck safe: " + string.Join("; ", errs));
    }

    private static string Head(string title, RefractionPalette t) => $$"""
        <!doctype html><html><head><meta charset="utf-8"><title>{{WebUtility.HtmlEncode(title)}}</title><style>
        body { background: {{t.Bg.Hex}}; color: {{t.Ink.Hex}}; font: 14px/1.4 "Segoe UI", system-ui, sans-serif; margin: 24px; }
        h1 { font-size: 20px; margin: 0 0 4px; } h2 { font-size: 15px; margin: 0 0 10px; } h2 small { color: {{t.Muted.Hex}}; font-weight: 400; margin-left: 8px; }
        .note { color: {{t.Muted.Hex}}; margin: 0 0 16px; } a { color: {{t.Accent.Hex}}; }
        .row { display: flex; gap: 28px; flex-wrap: wrap; margin-bottom: 24px; align-items: flex-start; }
        .dev { background: {{t.Panel.Hex}}; border: 1px solid {{t.Line.Hex}}; border-radius: 14px; padding: 14px 16px; }
        .devbody { display: flex; gap: 18px; align-items: flex-start; flex-wrap: wrap; }
        .keys { display: grid; gap: 10px; }
        .key { border-radius: 10px; display: block; }
        .screen { display: grid; grid-template-columns: repeat(2, 300px); gap: 6px; background: #000000; padding: 8px; border-radius: 8px; }
        .screen img, .strip img { display: block; }
        .cap { grid-column: span 2; color: #8a8a99; font-size: 11px; }
        .strip { display: flex; gap: 2px; background: #000000; padding: 6px; border-radius: 6px; margin-top: 6px; flex-basis: 100%; }
        .sheet { display: flex; flex-wrap: wrap; gap: 14px; margin-bottom: 20px; }
        figure { margin: 0; width: 128px; } figure.wide { width: 304px; } figure img { border-radius: 10px; display: block; }
        figcaption { color: {{t.Muted.Hex}}; font-size: 11px; margin-top: 4px; }
        </style></head><body>
        """;
}
