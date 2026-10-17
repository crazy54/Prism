using System.Text.Json.Nodes;
using PrismControl.Core.Actions;
using PrismControl.Core.Data;
using PrismControl.Core.Hosting;
using PrismControl.Core.PropertyInspector;
using PrismControl.FakeHost;
using PrismControl.Testing;

namespace PrismControl.Tests;

public sealed class SafeProbe : KeyAction<ProbeSettings>
{
    public bool SeenSafeMode;
    public bool InteractiveAtDown;
    protected override Task OnKeyDownAsync(KeyDownEvent e)
    {
        SeenSafeMode = SafeMode;
        InteractiveAtDown = IsInteractive;
        return Task.CompletedTask;
    }

    protected override PiForm? DescribeForm() => new PiForm()
        .Select("deviceId", "Device", optionsFrom: "devices.list")
        .MultiSelect("cycle", "Cycle through", optionsFrom: "devices.list", ordered: true, max: 4)
        .TextArea("text", "Text", "Type here", rows: 50)
        .Select(PiForm.Global("eq", "backend"), "Backend", [("sonar", "SteelSeries Sonar"), ("apo", "Equalizer APO")]);
}

public sealed class NullProbeSettings
{
    public string Text { get; set; } = "hello";
    public string? Note { get; set; } = "kept";
    public int Step { get; set; } = 2;
    public List<string> Items { get; set; } = ["a"];
    public NullProbeInner Inner { get; set; } = new();
}

public sealed class NullProbeInner
{
    public string Name { get; set; } = "inner";
    public double Gain { get; set; } = 1.5;
}

public sealed class NullProbe : KeyAction<NullProbeSettings>
{
    public int Renders;
    protected override Task OnWillAppearAsync(WillAppearEvent e)
    {
        Renders++;
        SetTitle(Settings.Text.ToUpperInvariant() + Settings.Inner.Name.Length); // throws on a null Text/Inner
        return Task.CompletedTask;
    }
}

public class SafeModeTests
{
    [Test]
    public void Safe_mode_switch_parses_on_values_only()
    {
        foreach (var on in new[] { "1", "true", "TRUE", " yes ", "On" }) Assert.True(SafeModeEnvironment.IsOn(on), on);
        foreach (var off in new[] { null, "", "0", "false", "no", "off", "2" }) Assert.False(SafeModeEnvironment.IsOn(off), off ?? "null");
        Assert.Equal("PRISM_CONTROL_SAFE_MODE", SafeModeEnvironment.Variable);
        Assert.Equal("PRISM_CONTROL_MACROS_DRY_RUN", SafeModeEnvironment.MacrosDryRunVariable);
    }

    [Test]
    public void Fake_host_launch_variables_match_the_core_switch()
    {
        Assert.Equal(SafeModeEnvironment.Variable, FakeHostSafety.SafeModeVariable);
        Assert.Equal(SafeModeEnvironment.MacrosDryRunVariable, FakeHostSafety.MacrosDryRunVariable);
        foreach (var (k, v) in SafeModeEnvironment.LaunchVariables) Assert.Equal(v, FakeHostSafety.LaunchVariables[k], k);
        Assert.Equal(SafeModeEnvironment.LaunchVariables.Count, FakeHostSafety.LaunchVariables.Count);
    }

    [Test]
    public async Task Actions_read_safe_mode_from_the_host()
    {
        await using (var off = await ActionHarness<SafeProbe>.AppearAsync())
        {
            await off.PressAsync();
            Assert.False(off.Action.SeenSafeMode);
        }
        await using var on = await ActionHarness<SafeProbe>.AppearAsync(safeMode: true);
        await on.PressAsync();
        Assert.True(on.Action.SeenSafeMode);
    }

    [Test]
    public void Process_launcher_starts_nothing_in_safe_mode()
    {
        var before = Environment.GetEnvironmentVariable(SafeModeEnvironment.Variable);
        try
        {
            Environment.SetEnvironmentVariable(SafeModeEnvironment.Variable, "1");
            // If the guard ever broke, this would only run "cmd /c exit 0" in this console (harmless).
            using var p = ProcessLauncher.Start("cmd.exe", "/c exit 0", useShellExecute: false);
            Assert.Null(p);
        }
        finally { Environment.SetEnvironmentVariable(SafeModeEnvironment.Variable, before); }
    }

    [Test]
    public void The_safe_set_is_the_shipped_samples_and_diagnostics()
    {
        var report = ActionValidator.Scan(Hosting.ModuleLoader.Load(NullLog.Instance).Select(m => m.Assembly).Append(typeof(PluginInfo).Assembly));
        foreach (var uuid in FakeHostSafety.SafeActions)
        {
            var a = report.Actions.SingleOrDefault(x => x.Uuid == uuid);
            Assert.NotNull(a, uuid + " is not a shipped action");
            Assert.Equal(uuid != FakeHostSafety.Diagnostics, !a!.Attribute.VisibleInActionsList, uuid + ": samples are hidden, diagnostics is visible");
            Assert.True(a.Type.Name.StartsWith("Sample", StringComparison.Ordinal) || uuid == FakeHostSafety.Diagnostics, a.Type.Name);
        }
        var samples = report.Actions.Where(a => a.Type.Name.StartsWith("Sample", StringComparison.Ordinal)).Select(a => a.Uuid);
        Assert.True(samples.All(FakeHostSafety.IsSafe), "every Sample* action is in the safe set");
    }

    [Test]
    public void Fake_host_default_plan_places_only_samples_and_diagnostics()
    {
        var manifest = new List<ManifestAction>
        {
            new("com.jeremyfhall.prismcontrol.audio.volume", true, true),
            new("com.jeremyfhall.prismcontrol.macros.type-text", true, false),
            new("com.jeremyfhall.prismcontrol.core.diagnostics", true, true),
            new("com.jeremyfhall.prismcontrol.audio.sample-level", true, true),
            new("com.jeremyfhall.prismcontrol.macros.sample-counter", true, false),
        };
        var plan = FakeHostPlan.Create(manifest, [], allowRealActions: false);
        Assert.False(plan.Refused);
        Assert.Equal(3, plan.Actions.Count);
        Assert.True(plan.Actions.All(a => FakeHostSafety.SafeActions.Contains(a.Uuid)), "the default run places samples + diagnostics only");

        // --gated adds the real actions whose modules gate every write on safe mode.
        var gated = FakeHostPlan.Create(manifest, [], allowRealActions: false, gated: true);
        Assert.Equal(5, gated.Actions.Count);
        Assert.Contains("--gated", string.Join("\n", gated.Warnings));

        // No manifest: diagnostics only.
        var bare = FakeHostPlan.Create([], [], allowRealActions: true);
        Assert.Equal(FakeHostSafety.Diagnostics, Assert.Single(bare.Actions).Uuid);
        Assert.Contains("no effect without --action", string.Join("\n", bare.Warnings));
    }

    [Test]
    public void Fake_host_refuses_real_actions_without_the_flag()
    {
        // An action whose module does not gate its writes (a stand-in uuid: every shipped module is gated since wave 3).
        const string ungated = "com.jeremyfhall.prismcontrol.example.ungated";
        var manifest = new List<ManifestAction> { new(ungated, true, true), new("com.jeremyfhall.prismcontrol.audio.volume", true, true) };
        var refused = FakeHostPlan.Create(manifest, ["com.jeremyfhall.prismcontrol.core.diagnostics", ungated], allowRealActions: false);
        Assert.True(refused.Refused);
        Assert.Contains("--allow-real-actions", refused.Error!);
        Assert.Contains(ungated, refused.Error!);
        Assert.Empty(refused.Actions);

        var allowed = FakeHostPlan.Create(manifest, [ungated], allowRealActions: true);
        Assert.False(allowed.Refused);
        Assert.Contains("REAL action " + ungated, Assert.Single(allowed.Warnings));

        // A gated real action needs no flag and gets no warning.
        var gatedOne = FakeHostPlan.Create(manifest, ["com.jeremyfhall.prismcontrol.audio.volume"], allowRealActions: false);
        Assert.False(gatedOne.Refused);
        Assert.Empty(gatedOne.Warnings);

        // Asking for safe actions explicitly needs no flag.
        Assert.False(FakeHostPlan.Create(manifest, ["com.jeremyfhall.prismcontrol.eq.sample-band"], false).Refused);
    }

    [Test]
    public async Task Fake_stream_deck_refuses_to_place_a_real_action_unless_allowed()
    {
        await using var host = await FakeStreamDeck.StartAsync();
        var g = host.Options.Devices[0];
        var ex = await Assert.ThrowsAsync<InvalidOperationException>(() => host.AppearAsync(g, "com.jeremyfhall.prismcontrol.example.ungated", 0, 0));
        Assert.Contains("refusing to place", ex.Message);
        // A safe action passes the guard (and then fails only because no plugin is connected).
        var notConnected = await Assert.ThrowsAsync<InvalidOperationException>(() => host.AppearAsync(g, FakeHostSafety.Diagnostics, 0, 0));
        Assert.DoesNotContain("refusing", notConnected.Message);

        await using var allowed = await FakeStreamDeck.StartAsync(new FakeHostOptions { AllowRealActions = ["com.jeremyfhall.prismcontrol.example.ungated"] });
        var passed = await Assert.ThrowsAsync<InvalidOperationException>(() => allowed.AppearAsync(g, "com.jeremyfhall.prismcontrol.example.ungated", 0, 0));
        Assert.DoesNotContain("refusing", passed.Message);
    }
}

public class SettingsNullabilityTests
{
    [Test]
    public void Imported_nulls_and_wrong_types_keep_their_defaults()
    {
        var raw = JsonNode.Parse("""{"text":null,"note":null,"step":"abc","items":null,"inner":{"name":null,"gain":"2.5"}}""");
        var problems = new List<string>();
        var s = ActionJson.ReadOrDefault<NullProbeSettings>(raw, problems);
        Assert.Equal("hello", s.Text);
        Assert.Null(s.Note); // nullable: an explicit null is a value
        Assert.Equal(2, s.Step);
        Assert.Equal("a", Assert.Single(s.Items));
        Assert.Equal("inner", s.Inner.Name);
        Assert.Near(2.5, s.Inner.Gain, 1e-9); // other values survive
        var all = string.Join(" ", problems);
        foreach (var path in new[] { "$.text", "$.step", "$.items", "$.inner.name" }) Assert.Contains(path, all);
        Assert.DoesNotContain("$.note", all);
    }

    [Test]
    public void Unrepairable_settings_fall_back_to_new_settings()
    {
        var problems = new List<string>();
        var s = ActionJson.ReadOrDefault<NullProbeSettings>(JsonNode.Parse("""{"text":"x","items":["a",{"b":1}]}"""), problems);
        Assert.Equal("hello", s.Text); // an invalid array element is not dropped silently: the whole object is reset
        Assert.Single(problems);
        Assert.NotNull(ActionJson.ReadOrDefault<NullProbeSettings>(JsonValue.Create(42)));
        Assert.NotNull(ActionJson.ReadOrDefault<NullProbeSettings>(null));
    }

    [Test]
    public async Task An_imported_profile_with_nulls_still_renders()
    {
        await using var h = await ActionHarness<NullProbe>.AppearAsync(settings: JsonNode.Parse("""{"text":null,"inner":null,"step":5}"""));
        Assert.Equal(1, h.Action.Renders);
        Assert.Equal("HELLO5", h.CallsOf("setTitle").Single().Payload!["title"]!.GetValue<string>());
        Assert.Equal(5, h.Action.Settings.Step);
    }

    // Review B #5: an imported Type Text step with "text": null threw on every render. Now the step reads as an
    // unreadable step (kept for round trips) and the macro describes and validates without throwing.
    [Test]
    public void An_imported_macro_with_a_null_text_step_does_not_throw()
    {
        var raw = JsonNode.Parse("""{"label":"Hi","macro":{"version":2,"steps":[{"type":"text","text":null},{"type":"text","text":"ok"}]}}""");
        var s = ActionJson.ReadOrDefault<Macros.Actions.MacroKeySettings>(raw);
        Assert.Equal("Hi", s.Label);
        Assert.Equal(2, s.Macro.Steps.Count);
        Assert.NotNull(s.Macro.Describe());
        Assert.True(s.Macro.Validate().Count > 0, "the unreadable step is reported");
    }

    [Test]
    public void Writing_a_forced_null_never_throws()
    {
        var node = ActionJson.ToNode(new NullProbeSettings { Text = null! });
        Assert.NotNull(node);
        Assert.Null(node!["text"]);
        Assert.Equal(2, node["step"]!.GetValue<int>());
    }

    [Test]
    public void Global_sections_are_read_leniently_too()
    {
        var g = new TestGlobalSettings(JsonNode.Parse("""{"core":{"updateBudget":null,"theme":null},"x":{"text":null}}""")!.AsObject());
        Assert.Equal(60, g.Core.UpdateBudget);
        Assert.Equal("night", g.Core.Theme);
        Assert.Equal("hello", g.GetSection<NullProbeSettings>("x").Text);
    }
}

public class PropertyInspectorTests
{
    [Test]
    public void Form_has_textarea_multiselect_and_global_fields()
    {
        var form = new PiForm()
            .TextArea("text", "Text", "Type here", rows: 50)
            .MultiSelect("cycle", "Cycle", [("a", "A"), ("b", "B")], ordered: true, max: 0)
            .MultiSelect("tags", "Tags", optionsFrom: "tags.list")
            .Checkbox(PiForm.Global("eq", "enabled"), "EQ on")
            .ToJson();
        var f = form["fields"]!.AsArray();
        Assert.Equal("textarea", f[0]!["kind"]!.GetValue<string>());
        Assert.Equal(20, f[0]!["rows"]!.GetValue<int>());
        Assert.Equal("Type here", f[0]!["placeholder"]!.GetValue<string>());
        Assert.Equal("multiselect", f[1]!["kind"]!.GetValue<string>());
        Assert.True(f[1]!["ordered"]!.GetValue<bool>());
        Assert.Equal(1, f[1]!["max"]!.GetValue<int>());
        Assert.Equal(2, f[1]!["options"]!.AsArray().Count);
        Assert.Equal("tags.list", f[2]!["optionsFrom"]!.GetValue<string>());
        Assert.Null(f[2]!["ordered"]);
        Assert.Equal("global:eq.enabled", f[3]!["setting"]!.GetValue<string>());
        Assert.Throws<ArgumentException>(() => PiForm.Global("a.b", "c"));
        Assert.Throws<ArgumentException>(() => PiForm.Global("eq", " "));
    }

    [Test]
    public async Task Option_lists_and_the_form_can_be_refreshed_while_the_pi_is_open()
    {
        await using var h = await ActionHarness<SafeProbe>.AppearAsync();
        h.Action.RefreshPropertyInspectorOptions("devices.list");
        h.Action.RefreshPropertyInspectorForm();
        Assert.Equal(0, h.Count("sendToPropertyInspector")); // closed: nothing is sent

        await h.PropertyInspectorAppearAsync();
        h.Action.RefreshPropertyInspectorOptions("devices.list");
        h.Action.RefreshPropertyInspectorOptions();
        h.Action.RefreshPropertyInspectorForm();
        var sent = h.CallsOf("sendToPropertyInspector").Select(c => c.Payload!).ToList();
        Assert.Equal(3, sent.Count);
        Assert.Equal("pi.refresh", sent[0]["type"]!.GetValue<string>());
        Assert.Equal("devices.list", sent[0]["data"]!["lists"]![0]!.GetValue<string>());
        Assert.Null(sent[1]["data"]); // all lists
        Assert.Equal("pi.hello", sent[2]["type"]!.GetValue<string>());
        Assert.Equal(4, sent[2]["data"]!["form"]!["fields"]!.AsArray().Count);
    }

    [Test]
    public void Bridge_handles_the_new_field_kinds_and_messages()
    {
        var js = File.ReadAllText(Path.Combine(Repo.Root, "pi", "lib", "prism-pi.js"));
        foreach (var token in new[] { "case 'textarea':", "case 'multiselect':", "'pi.refresh'", "GLOBAL_PREFIX = 'global:'", "setKey:", "data-missing" })
            Assert.Contains(token, js);
    }
}

public class CpuTemperatureTests
{
    private sealed class Source(Func<CpuTemperatureReading?> read) : ICpuTemperatureSource
    {
        public CpuTemperatureReading? Latest => read();
    }

    [Test]
    public void Shared_reading_is_used_only_when_fresh_and_real()
    {
        var now = new DateTimeOffset(2026, 10, 16, 12, 0, 0, TimeSpan.Zero);
        var services = new ServiceRegistry();
        Assert.Null(CpuTemperature.ReadShared(services, now));

        CpuTemperatureReading? current = new CpuTemperatureReading(61.5, CpuTemperature.Icue, now.AddSeconds(-3));
        services.Add<ICpuTemperatureSource>(new Source(() => current));
        Assert.Near(61.5, CpuTemperature.ReadShared(services, now)!.Value.TempC, 1e-9);
        Assert.Equal("icue", CpuTemperature.ReadShared(services, now)!.Value.Source);

        current = current.Value with { At = now - CpuTemperature.MaxAge - TimeSpan.FromSeconds(1) };
        Assert.Null(CpuTemperature.ReadShared(services, now)); // stale
        current = current.Value with { At = now.AddSeconds(30) };
        Assert.Null(CpuTemperature.ReadShared(services, now)); // stamped in the future
        current = new CpuTemperatureReading(double.NaN, CpuTemperature.Icue, now);
        Assert.Null(CpuTemperature.ReadShared(services, now));
        current = null;
        Assert.Null(CpuTemperature.ReadShared(services, now));

        services.Add<ICpuTemperatureSource>(new Source(() => throw new InvalidOperationException("provider broke")));
        Assert.Null(CpuTemperature.ReadShared(services, now)); // never breaks the consumer
    }
}

public class ValidatorAndTimeTests
{
    [Test]
    public void Domain_tests_can_run_the_hosts_validation()
    {
        var shipped = ActionValidator.Scan(typeof(Audio.AudioModule).Assembly, typeof(Macros.MacrosModule).Assembly);
        Assert.True(shipped.IsValid, string.Join("\n", shipped.Errors));
        Assert.True(shipped.Actions.Count >= 10);

        var broken = ActionValidator.Scan(typeof(ManifestTests).Assembly);
        Assert.False(broken.IsValid);
        Assert.Contains("Encoder actions must derive DialAction", string.Join("\n", broken.Errors));
        Assert.True(ActionValidator.IsValidUuid("com.jeremyfhall.prismcontrol.audio.volume"));
        Assert.False(ActionValidator.IsValidUuid("com.jeremyfhall.prismcontrol.Audio"));
        Assert.True(ActionValidator.IsValidLayout("layouts/prism-canvas.json"));
        Assert.False(ActionValidator.IsValidLayout("$Z9"));
    }

    [Test]
    public void Manual_clock_starts_at_a_non_zero_timestamp()
    {
        var t = new ManualTimeProvider();
        Assert.Equal(ManualTimeProvider.StartTimestamp, t.GetTimestamp());
        Assert.True(t.GetTimestamp() > 0);
        Assert.Equal(TimeSpan.Zero, t.Elapsed);
        t.Advance(TimeSpan.FromSeconds(3));
        Assert.Equal(TimeSpan.FromSeconds(3), t.Elapsed);
        Assert.Equal(TimeSpan.FromSeconds(3), t.GetElapsedTime(ManualTimeProvider.StartTimestamp));
    }

    [Test]
    public async Task Input_at_the_first_tick_is_interactive_and_the_clock_can_be_shared()
    {
        var clock = new ManualTimeProvider();
        await using var h = await ActionHarness<SafeProbe>.AppearAsync(time: clock);
        Assert.True(ReferenceEquals(clock, h.Time));
        Assert.False(h.Action.IsInteractive); // no input yet
        await h.KeyDownAsync();
        Assert.True(h.Action.InteractiveAtDown);
        await h.KeyUpAsync();
        await h.AdvanceAsync(TimeSpan.FromSeconds(3));
        Assert.False(h.Action.IsInteractive);
    }
}
