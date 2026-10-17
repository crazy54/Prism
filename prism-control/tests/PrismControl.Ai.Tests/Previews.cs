using System.Net;
using System.Text;
using System.Text.Json.Nodes;
using PrismControl.Ai.Actions;
using PrismControl.Ai.Approvals;
using PrismControl.Ai.Art;
using PrismControl.Ai.Sessions;
using PrismControl.Core.Render;
using PrismControl.Core.Render.Tokens;
using PrismControl.Testing;

namespace PrismControl.Ai.Tests;

/// <summary>
/// <c>--render-previews &lt;dir&gt;</c>: the real frames of every AI face, Night and Day, plus index-night.html and index-day.html with
/// keys at 72 / 120 / 160 px (Standard, Stream Deck +, Galleon) and widgets at 200×100 (Stream Deck + strip) and 360×180
/// (Galleon screen). The card's two native text lines are overlaid in a system font, like the app draws them.
/// <c>--write-icons &lt;dir&gt;</c>: the action-list icons and default key images for plugin/imgs/actions/ai.
/// </summary>
public static class AiPreviews
{
    private sealed record Frame(string Name, string Svg, string? Line1 = null, string? Line2 = null, string? Line3 = null);

    public static async Task<int> WriteAsync(string dir)
    {
        Directory.CreateDirectory(dir);
        foreach (var theme in new[] { "night", "day" })
        {
            var t = theme == "night" ? Refraction.Night : Refraction.Day;
            var keys = new List<Frame>();
            var dials = new List<Frame>();
            using var rig = new TestRig();
            Populate(rig);
            var now = rig.Time.GetUtcNow();
            var views = rig.Sessions.Snapshot(PrivacyMode.Reveal);
            SessionView Slot(int s) => views.First(v => v.Slot == s);

            for (var s = 1; s <= 9; s++)
                keys.Add(new($"session-{s}-{SessionStates.Label(Slot(s).State.Value).ToLowerInvariant().Replace(' ', '-')}",
                    AiKeyArt.Session(t, new SessionKeyModel(s, Slot(s), now + TimeSpan.FromSeconds(3), PulseOn: true)).ToSvg()));
            keys.Add(new("session-1-stale-fact", AiKeyArt.Session(t, new SessionKeyModel(1, Slot(1), now + TimeSpan.FromSeconds(75), PulseOn: true)).ToSvg()));
            keys.Add(new("session-2-pulse-off", AiKeyArt.Session(t, new SessionKeyModel(2, Slot(2), now + TimeSpan.FromSeconds(75), PulseOn: false)).ToSvg()));
            keys.Add(new("session-empty", AiKeyArt.Session(t, new SessionKeyModel(12, null, now, false)).ToSvg()));
            keys.Add(new("session-flash-focused", AiKeyArt.Session(t, new SessionKeyModel(1, Slot(1), now, false, "FIND THE TAB")).ToSvg()));
            keys.Add(new("session-private-alias", AiKeyArt.Session(t, new SessionKeyModel(1, rig.Sessions.BySlot(1, PrivacyMode.Private), now + TimeSpan.FromMinutes(14), false)).ToSvg()));
            var nm = rig.Sessions.NextNeedsMe(PrivacyMode.Private);
            keys.Add(new("next-3", AiKeyArt.Next(t, nm, 3, now + TimeSpan.FromSeconds(42)).ToSvg()));
            keys.Add(new("next-clear", AiKeyArt.Next(t, null, 0, now).ToSvg()));
            var hold = TimeSpan.FromSeconds(1.2);
            keys.Add(new("approve-armed", AiKeyArt.Approve(t, ApproveBlock.None, null, true, null, false, hold).ToSvg()));
            keys.Add(new("approve-holding-60", AiKeyArt.Approve(t, ApproveBlock.None, 0.6, false, null, false, hold).ToSvg()));
            keys.Add(new("approve-allowed", AiKeyArt.Approve(t, ApproveBlock.None, null, false, "ALLOWED", false, hold).ToSvg()));
            keys.Add(new("approve-changed", AiKeyArt.Approve(t, ApproveBlock.None, null, false, "CHANGED", true, hold).ToSvg()));
            keys.Add(new("approve-flash-review", AiKeyArt.Approve(t, ApproveBlock.None, null, false, "REVIEW IN TERMINAL", true, hold).ToSvg()));
            foreach (var b in new[] { ApproveBlock.NoRequest, ApproveBlock.PrivateMode, ApproveBlock.UnknownSession, ApproveBlock.TooSoon, ApproveBlock.DetailsHidden,
                ApproveBlock.ReviewInTerminal, ApproveBlock.UnusualCharacters, ApproveBlock.TooLong })
                keys.Add(new($"approve-{b.ToString().ToLowerInvariant()}", AiKeyArt.Approve(t, b, null, false, null, false, hold).ToSvg()));
            keys.Add(new("deny-claude", AiKeyArt.Deny(t, true, true, null, null, false).ToSvg()));
            keys.Add(new("deny-holding", AiKeyArt.Deny(t, true, true, 0.7, null, false).ToSvg()));
            keys.Add(new("deny-none", AiKeyArt.Deny(t, false, false, null, null, false).ToSvg()));
            keys.Add(new("deny-denied", AiKeyArt.Deny(t, true, false, null, "DENIED", false).ToSvg()));
            keys.Add(new("privacy-private", AiKeyArt.Privacy(t, new AiSettings()).ToSvg()));
            keys.Add(new("privacy-reveal", AiKeyArt.Privacy(t, new AiSettings { Privacy = "reveal" }).ToSvg()));
            keys.Add(new("privacy-on-air", AiKeyArt.Privacy(t, new AiSettings { OnAir = true }).ToSvg()));

            // Requests: every display-policy state (reviews H1/M1/M2/M3/L2/L14), then private, unknown, unprotected, none.
            rig.Presence.Register("a", SurfaceKind.Approve, TestRig.Device, false);
            rig.Presence.Register("c", SurfaceKind.Details, TestRig.Device, false);
            var reqs = new List<(string Name, Func<string> Make)>
            {
                ("short", () => Request(rig, "p-1", "Bash", Cmd("npm test -- --watch=false"))),
                ("two-lines", () => Request(rig, "p-2", "Bash", Cmd("dotnet build src/PrismControl.Ai -c Release"))),
                ("multiline", () => Request(rig, "p-3", "Bash", Cmd("git status\nrm -rf ./build"))),
                ("too-long", () => Request(rig, "p-4", "Bash", Cmd("docker compose -f deploy/compose.example.yaml up --build --force-recreate api worker"))),
                ("64kb-command", () => Request(rig, "p-5", "Bash", new JsonObject { ["tool"] = "Bash", ["input"] = "complete", ["command_incomplete"] = true, ["command_length"] = 70046 })),
                ("bidi", () => Request(rig, "p-6", "Bash", Cmd("echo \u2067ok #\u2069 && rm -rf ~/x"))),
                ("powershell", () => Request(rig, "p-7", "PowerShell", Cmd("Remove-Item -Recurse .\\build"))),
                ("write-outside", () => Request(rig, "p-8", "Write", new JsonObject { ["tool"] = "Write", ["input"] = "complete", ["file"] = @"C:\Users\example\.ssh\authorized_keys", ["file_scope"] = "outside" })),
                ("edit-workspace", () => Request(rig, "p-9", "Edit", new JsonObject { ["tool"] = "Edit", ["input"] = "complete", ["file"] = @"src\app.ts", ["file_scope"] = "workspace" })),
                ("webfetch", () => Request(rig, "p-10", "WebFetch", new JsonObject { ["tool"] = "WebFetch", ["input"] = "complete", ["url"] = "https://docs.example/p?data=1", ["host"] = "docs.example" })),
                ("mcp-args", () => Request(rig, "p-11", "mcp__db__drop_table", new JsonObject { ["tool"] = "mcp__db__drop_table", ["input"] = "complete", ["args"] = new JsonArray(new JsonArray("table", "customers"), new JsonArray("cascade", true)) })),
                ("mcp-nested", () => Request(rig, "p-12", "mcp__db__query", new JsonObject { ["tool"] = "mcp__db__query", ["input"] = "complete", ["args"] = new JsonArray(), ["args_incomplete"] = true })),
                ("via-python", () => Request(rig, "p-13", "Bash", Cmd("npm test"), via: true)),
                ("unknown", () => Request(rig, "p-14", "WebFetch", new JsonObject { ["tool"] = "WebFetch", ["input"] = "complete", ["url"] = "https://status.example.com/health" }, known: false)),
                ("bypass", () => Request(rig, "p-15", "Bash", Cmd("rm -rf ./build"), mode: "bypassPermissions")),
            };
            var later = now + TimeSpan.FromSeconds(9);
            foreach (var (name, make) in reqs)
            {
                var r = make();
                var view = rig.Broker.Pending().First(p => p.Id == r);
                var session = rig.Sessions.Find(view.Session, PrivacyMode.Reveal);
                var (l1, l2, l3, shown) = CardText.Lay(view);
                dials.Add(new($"card-{name}", AiDialArt.Card(t, view, session, later, true, null, true, shown).ToSvg(), l1, l2, l3));
                keys.Add(new($"details-{name}", AiKeyArt.Details(t, view, session, later, false).Doc.ToSvg()));
                if (name != "short") rig.Broker.Withdraw(r, "preview");   // one at a time (the 8-pending and per-process caps)
            }
            rig.Update(s => s.Privacy = "private");
            var priv = rig.Broker.Pending()[0];
            dials.Add(new("card-private", AiDialArt.Card(t, priv, rig.Sessions.Find(priv.Session, PrivacyMode.Private), later, true, null, true).ToSvg(), "", ""));
            keys.Add(new("details-private", AiKeyArt.Details(t, priv, rig.Sessions.Find(priv.Session, PrivacyMode.Private), later, false).Doc.ToSvg()));
            dials.Add(new("card-none", AiDialArt.Card(t, null, null, now, false, now - TimeSpan.FromMinutes(4), true).ToSvg(), "", ""));
            keys.Add(new("details-none", AiKeyArt.Details(t, null, null, now, false).Doc.ToSvg()));

            var all = rig.Sessions.Snapshot(PrivacyMode.Private);
            dials.Add(new("fleet-galleon-12", AiDialArt.Fleet(t, all, 6, 1, 3, now, true, null).ToSvg()));
            dials.Add(new("fleet-plus-8", AiDialArt.Fleet(t, all, 4, 1, 2, now, false, null).ToSvg()));
            dials.Add(new("fleet-banner", AiDialArt.Fleet(t, all, 6, 1, 3, now, true,
                new SessionTransition(Slot(2).Key, 2, SessionState.Working, SessionState.NeedsPermission, now)).ToSvg()));
            dials.Add(new("fleet-empty", AiDialArt.Fleet(t, [], 6, 1, 1, now, false, null).ToSvg()));

            foreach (var f in keys.Concat(dials))
            {
                var lint = SvgLint.Check(f.Svg, keys.Contains(f) ? SvgCanvas.Key : SvgCanvas.Any).Where(i => i.Severity == LintSeverity.Error).ToList();
                if (lint.Count > 0) throw new InvalidOperationException($"{f.Name}: {string.Join("; ", lint)}");
                File.WriteAllText(Path.Combine(dir, $"{theme}-{f.Name}.svg"), f.Svg);
            }
            File.WriteAllText(Path.Combine(dir, $"index-{theme}.html"), Page(theme, t, keys, dials).Replace("#f0f0f5;font", t.KeyInk.Hex + ";font").Replace("color:#a2a4b4", "color:" + t.KeyMuted.Hex));
        }
        await Task.CompletedTask;
        Console.WriteLine($"previews written to {Path.GetFullPath(dir)}");
        return 0;
    }

    private static void Populate(TestRig rig)
    {
        TrackerTests.List(rig,
            TrackerTests.Entry("s-1", "busy", pid: 4242, startedAt: 1, title: "Refactor parser", cwd: @"C:\Users\example\projects\aurora"),
            TrackerTests.Entry("s-2", "waiting", "permission prompt", pid: 4242, startedAt: 2, title: "Fix the build", cwd: @"C:\Users\example\projects\borealis"),
            TrackerTests.Entry("s-3", "waiting", "input needed", pid: 4242, startedAt: 3, cwd: @"C:\Users\example\projects\cassini"));
        rig.Hook("Stop", "s-4");
        rig.Hook("StopFailure", "s-5", fields: new() { ["hook_event_name"] = "StopFailure", ["error"] = "rate_limit" });
        rig.Hook("SessionStart", "s-6");
        rig.Hook("UserPromptSubmit", "s-7", agent: "codex");
        rig.Hook("SubagentStart", "s-7", agent: "codex", fields: new() { ["hook_event_name"] = "SubagentStart", ["agent_id"] = "a" });
        rig.Hook("UserPromptSubmit", "s-8", fields: new() { ["hook_event_name"] = "UserPromptSubmit", ["permission_mode"] = "bypassPermissions" });
        rig.Hook("UserPromptSubmit", "s-9");
        rig.Time.Advance(TimeSpan.FromMinutes(11));
        rig.Sessions.Tick();   // s-9 (no list, no signal) → stale; s-4 done → idle
        rig.Hook("Stop", "s-4");
        rig.Hook("UserPromptSubmit", "s-8");
        rig.Hook("UserPromptSubmit", "s-7", agent: "codex");
        TrackerTests.List(rig,
            TrackerTests.Entry("s-1", "busy", pid: 4242, startedAt: 1, title: "Refactor parser", cwd: @"C:\Users\example\projects\aurora"),
            TrackerTests.Entry("s-2", "waiting", "permission prompt", pid: 4242, startedAt: 2, title: "Fix the build", cwd: @"C:\Users\example\projects\borealis"),
            TrackerTests.Entry("s-3", "waiting", "input needed", pid: 4242, startedAt: 3, cwd: @"C:\Users\example\projects\cassini"));
        rig.Hook("UserPromptSubmit", "s-10");
        rig.Hook("SessionEnd", "s-11");
    }

    private static int _previewAgents;

    private static JsonObject Cmd(string command) => new() { ["tool"] = "Bash", ["input"] = "complete", ["command"] = command };

    private static string Request(TestRig rig, string session, string tool, JsonObject summary, bool known = true, string mode = "default", bool via = false)
    {
        rig.Hook("SessionStart", session, fields: new() { ["hook_event_name"] = "SessionStart", ["permission_mode"] = mode, ["source"] = "startup" });
        var e = rig.Event("PermissionRequest", session, fields: new() { ["tool_name"] = tool, ["permission_mode"] = mode }, edit: j =>
        {
            j["agentProcess"]!["pid"] = 6000 + ++_previewAgents;   // one agent process per preview session (the per-process caps)
            j["parent"] = j["agentProcess"]!.DeepClone();
            // The relay was started by a program the agent ran (review L14): the chain has python.exe between it and the agent.
            j["chain"] = via
                ? new JsonArray(new JsonObject { ["pid"] = 900, ["exe"] = "python.exe", ["startedAt"] = 1792141300000 }, j["agentProcess"]!.DeepClone())
                : new JsonArray(j["agentProcess"]!.DeepClone());
        });
        rig.Sessions.ApplyHook(e, known);
        var offer = rig.Broker.Offer(e, known);
        if (summary["tool"] is JsonValue) summary["tool"] = tool;
        rig.Broker.AttachSummary(offer.RequestId!, TestRig.RevealOf(summary));
        return offer.RequestId!;
    }

    private static string Page(string theme, RefractionPalette t, List<Frame> keys, List<Frame> dials)
    {
        var sb = new StringBuilder();
        sb.Append($"<!doctype html><html><head><meta charset=\"utf-8\"><title>AI previews ({theme})</title><style>");
        sb.Append($"body{{margin:0;padding:20px;background:{(theme == "night" ? "#05060a" : "#e9e8f0")};color:{t.Ink.Hex};font:12px Segoe UI,sans-serif}}");
        sb.Append("h2{font-size:14px;margin:18px 0 8px;font-weight:600}.row{display:flex;flex-wrap:wrap;gap:14px;align-items:flex-end}");
        sb.Append(".cell{display:flex;flex-direction:column;align-items:center;gap:4px}.cell span{font-size:10px;opacity:.7;max-width:170px;text-align:center}");
        sb.Append("img{display:block;border-radius:12px}.dial{position:relative}.dial img{border-radius:6px}");
        sb.Append(".ov{position:absolute;left:5%;width:90%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-family:Segoe UI,sans-serif}");
        sb.Append("</style></head><body>");
        sb.Append($"<h2>Keys at 160 px (Galleon) · {theme}</h2><div class=\"row\">");
        foreach (var k in keys) sb.Append($"<div class=\"cell\"><img src=\"{theme}-{k.Name}.svg\" width=\"160\" height=\"160\"><span>{WebUtility.HtmlEncode(k.Name)}</span></div>");
        sb.Append("</div><h2>Keys at 120 px (Stream Deck +) and 72 px (Standard)</h2><div class=\"row\">");
        foreach (var k in keys.Where((_, i) => i % 2 == 0))
            sb.Append($"<div class=\"cell\"><img src=\"{theme}-{k.Name}.svg\" width=\"120\" height=\"120\"><img src=\"{theme}-{k.Name}.svg\" width=\"72\" height=\"72\"></div>");
        sb.Append("</div><h2>Widgets at 360×180 (Galleon screen)</h2><div class=\"row\">");
        foreach (var d in dials) sb.Append(Dial(theme, d, 360));
        sb.Append("</div><h2>Widgets at 200×100 (Stream Deck + strip segment)</h2><div class=\"row\">");
        foreach (var d in dials) sb.Append(Dial(theme, d, 200));
        sb.Append("</div></body></html>");
        return sb.ToString();
    }

    private static string Dial(string theme, Frame d, int w)
    {
        var s = w / 200.0;
        var h = (int)(100 * s);
        var sb = new StringBuilder($"<div class=\"cell\"><div class=\"dial\" style=\"width:{w}px;height:{h}px\"><img src=\"{theme}-{d.Name}.svg\" width=\"{w}\" height=\"{h}\">");
        var y = 25.0;
        foreach (var line in new[] { d.Line1, d.Line2, d.Line3 })
        {
            if (!string.IsNullOrEmpty(line))
                sb.Append($"<div class=\"ov\" style=\"top:{y * s:0}px;height:{17 * s:0}px;line-height:{17 * s:0}px;font-size:{12 * s:0.#}px;font-weight:600;color:#f0f0f5;font-family:Segoe UI\">{WebUtility.HtmlEncode(line)}</div>");
            y += 17;
        }
        sb.Append($"</div><span>{WebUtility.HtmlEncode(d.Name)}</span></div>");
        return sb.ToString();
    }

    /// <summary>Writes imgs/actions/ai/&lt;id&gt;/icon.svg (20×20, white) and key.svg (144, Night) for every action.</summary>
    public static int WriteIcons(string dir)
    {
        var t = Refraction.Night;
        var now = DateTimeOffset.UnixEpoch;
        var items = new (string Id, GlyphPart[] Glyph, SvgDocument Key)[]
        {
            ("session", AiGlyphs.Spark, AiKeyArt.Session(t, new SessionKeyModel(1, null, now, false))),
            ("next", AiGlyphs.Next, AiKeyArt.Next(t, null, 0, now)),
            ("fleet", AiGlyphs.Fleet, GlyphKey(t, AiGlyphs.Fleet, "FLEET")),
            ("request", AiGlyphs.Card, AiKeyArt.Details(t, null, null, now, false).Doc),
            ("approve", AiGlyphs.Approve, AiKeyArt.Approve(t, ApproveBlock.NoRequest, null, false, null, false, TimeSpan.FromSeconds(1.2))),
            ("deny", AiGlyphs.Deny, AiKeyArt.Deny(t, false, false, null, null, false)),
            ("privacy", AiGlyphs.EyeOff, AiKeyArt.Privacy(t, new AiSettings())),
        };
        foreach (var (id, glyph, key) in items)
        {
            var d = Path.Combine(dir, id);
            Directory.CreateDirectory(d);
            File.WriteAllText(Path.Combine(d, "icon.svg"), AiGlyphs.ActionIcon(glyph));
            File.WriteAllText(Path.Combine(d, "key.svg"), key.ToSvg());
        }
        Console.WriteLine($"icons written to {Path.GetFullPath(dir)}");
        return 0;
    }

    private static SvgDocument GlyphKey(RefractionPalette t, GlyphPart[] glyph, string label)
    {
        var d = Core.Art.KeyArt.Base(t);
        var hue = AiPalette.Module(t);
        AiGlyphs.Draw(d, glyph, 48, 26, 48, t.KeyInk, hue.Vivid);
        AiText.Draw(d, label, 72, 104, 19, t.KeyMuted, TextAlign.Middle);
        Core.Art.KeyArt.HueIndex(d, hue, on: false);
        return d;
    }
}
