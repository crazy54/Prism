using System.Text.Json.Nodes;
using PrismControl.Core.Devices;
using PrismControl.Core.Layouts;
using PrismControl.Core.Render;
using PrismControl.Core.Render.Tokens;
using PrismControl.Core.Scheduling;
using PrismControl.Cooling.Actions;
using PrismControl.Testing;

namespace PrismControl.Cooling.Tests;

public class ActionDeclarationTests
{
    [Test]
    public void Actions_follow_the_discovery_rules()
    {
        var types = typeof(CoolingModule).Assembly.GetTypes()
            .Select(t => (Type: t, Attr: (Core.Actions.StreamDeckActionAttribute?)Attribute.GetCustomAttribute(t, typeof(Core.Actions.StreamDeckActionAttribute), false)))
            .Where(x => x.Attr is not null).ToList();
        Assert.Equal("com.jeremyfhall.prismcontrol.cooling.dial,com.jeremyfhall.prismcontrol.cooling.fan,com.jeremyfhall.prismcontrol.cooling.fan-group,com.jeremyfhall.prismcontrol.cooling.pump",
            string.Join(",", types.Select(x => x.Attr!.Uuid).Order(StringComparer.Ordinal)));
        foreach (var (t, a) in types)
        {
            Assert.True(System.Text.RegularExpressions.Regex.IsMatch(a!.Uuid, @"^com\.jeremyfhall\.prismcontrol(\.[a-z0-9-]+)+$"), a.Uuid);
            Assert.True(a.Name.Length is > 0 and <= 30, a.Name);
            Assert.False(t.IsAbstract);
            Assert.NotNull(t.GetConstructor(Type.EmptyTypes));
            var dial = a.Controllers.HasFlag(Core.Actions.Controllers.Encoder);
            Assert.Equal(dial, typeof(Core.Actions.DialAction<CoolingDialSettings>).IsAssignableFrom(t), t.Name);
            if (dial) Assert.Equal(Layouts.Canvas.Path, a.Layout);
            // The designer's icons (wave 2): imgs/actions/cooling/<action>/icon + key (+ dial for the encoder).
            var folder = "imgs/actions/cooling/" + a.Uuid["com.jeremyfhall.prismcontrol.cooling.".Length..] + "/";
            Assert.Equal(folder + "icon", a.Icon);
            Assert.Equal(folder + "key", a.KeyImage);
            Assert.Equal(dial ? folder + "dial" : null, a.EncoderIcon);
            Assert.Empty(Core.Actions.ActionValidator.Validate(t, a!));
            _ = Activator.CreateInstance(t); // constructors do no work (the manifest generator loads these types)
        }
    }
}

public class KeyActionTests
{
    private static readonly (DeviceInfo Device, Coordinates At)[] KeyPlacements = [(TestDevices.Galleon, new(1, 2)), (TestDevices.Plus, new(3, 1))];

    private static string IdOf(CoolingService svc, string name) => svc.Current.Sensors.First(s => s.OriginalName == name).Id;

    [Test]
    public async Task Fan_key_shows_live_rpm_with_history_on_Galleon_and_Plus()
    {
        foreach (var (device, at) in KeyPlacements)
        {
            var (svc, icue, _, time, _) = Sample.Service();
            Sample.Feed(svc, icue, time, 90);
            var id = IdOf(svc, "iCUE LINK RX RGB #1: Fan");
            await using var h = await ActionHarness<FanKey>.AppearAsync(device, at, Controller.Keypad,
                settings: new SensorKeySettings { SensorId = id }, configureServices: s => s.Add(svc));
            var m = h.Action.LastModel!;
            Assert.Equal("RX RGB #1", m.Label);
            Assert.Equal(CoolingFormatRpm(svc.Current.Find(id)!.Value), m.Value);
            Assert.Equal("RPM", m.Sub);
            Assert.InRange(m.History.Count, 85, 91);
            Assert.True(m.ScaleMax > m.History.Max(p => p.Value) && m.ScaleMax % 250 == 0, "full scale is 125 % of the recent peak, in 250 RPM steps");
            Assert.InRange(m.Level, 0.6, 0.9);
            Assert.True(h.CallsOf("setImage").All(c => c.Priority == UpdatePriority.Background), "stats render at Background priority");

            var before = h.Count("setImage");
            await h.AdvanceAsync(TimeSpan.FromSeconds(3));
            Assert.InRange(h.Count("setImage") - before, 2, 4);      // 1 Hz render loop

            await h.PressAsync();
            Assert.True(h.LastSettingsAs<SensorKeySettings>().ShowStats);
            Assert.True(h.Action.LastModel!.Stats!.StartsWith('↓'));
            await h.PressAsync();
            Assert.Null(h.Action.LastModel!.Stats);
            h.AssertFramesAreDeckSafe();
        }
    }

    private static string CoolingFormatRpm(double? v) => Art.CoolingFormat.Rpm(v);

    [Test]
    public async Task Fan_key_explains_missing_data()
    {
        var (svc, icue, _, _, _) = Sample.Service();
        icue.Set(ProviderState.NotRunning);
        svc.SampleNow();
        await using (var h = await ActionHarness<FanKey>.AppearAsync(TestDevices.Plus, new(0, 0), Controller.Keypad, configureServices: s => s.Add(svc)))
        {
            Assert.Equal("ICUE OFF", h.Action.LastModel!.Sub);
            Assert.True(h.Action.LastModel.Muted);
            h.AssertFramesAreDeckSafe();
        }
        await using (var h = await ActionHarness<FanKey>.AppearAsync(TestDevices.Galleon, new(0, 0), Controller.Keypad))
        {
            Assert.Equal("COOLING OFF", h.Action.LastModel!.Sub);
            h.AssertFramesAreDeckSafe();
        }
    }

    [Test]
    public async Task Fan_key_picks_the_first_radiator_fan_automatically()
    {
        var (svc, icue, _, time, _) = Sample.Service();
        Sample.Feed(svc, icue, time, 5);
        await using var h = await ActionHarness<FanKey>.AppearAsync(TestDevices.Galleon, new(2, 3), Controller.Keypad, configureServices: s => s.Add(svc));
        Assert.Equal("QX RGB #1", h.Action.LastModel!.Label);         // no radiator fans yet: the first fan
        svc.SetRole(IdOf(svc, "iCUE LINK RX RGB #4: Fan"), "radiator");
        Sample.Feed(svc, icue, time, 1);
        await h.AdvanceAsync(TimeSpan.FromSeconds(1));
        Assert.Equal("RX RGB #4", h.Action.LastModel!.Label);
    }

    [Test]
    public async Task Pump_key_shows_rpm_and_coolant()
    {
        foreach (var (device, at) in KeyPlacements)
        {
            var (svc, icue, _, time, _) = Sample.Service();
            Sample.Feed(svc, icue, time, 30);
            await using var h = await ActionHarness<PumpKey>.AppearAsync(device, at, Controller.Keypad, configureServices: s => s.Add(svc));
            var m = h.Action.LastModel!;
            Assert.Equal("Pump", m.Label);
            Assert.Equal(Art.CoolingGlyph.Pump, m.Glyph);
            Assert.Contains("RPM · 4", m.Sub);
            Assert.Contains("°C", m.Sub);
            Assert.Equal(Art.CoolingFormat.Rpm(svc.Current.Group(FanGroup.Pump).Avg), m.Value);
            h.AssertFramesAreDeckSafe();
        }
    }

    [Test]
    public async Task Fan_key_PI_lists_fans_and_edits_the_shared_name_and_role()
    {
        var (svc, icue, _, time, globals) = Sample.Service();
        Sample.Feed(svc, icue, time, 3);
        var rx1 = IdOf(svc, "iCUE LINK RX RGB #1: Fan");
        var rx2 = IdOf(svc, "iCUE LINK RX RGB #2: Fan");
        await using var h = await ActionHarness<FanKey>.AppearAsync(TestDevices.Plus, new(1, 0), Controller.Keypad,
            settings: new SensorKeySettings { SensorId = rx1 }, configureServices: s => s.Add(svc));

        var reply = await h.PiMessageAsync("cooling.fans", null, requestId: 7);
        var options = reply!["data"]!.AsArray();
        Assert.Equal("", options[0]!["value"]!.GetValue<string>());     // automatic
        Assert.Equal(1 + 11, options.Count);                             // 10 LINK fans + the GPU fan
        Assert.Contains("RX RGB #1 — iCUE LINK System Hub (", string.Join("\n", options.Select(o => o!["label"]!.GetValue<string>())));

        await h.PropertyInspectorAppearAsync();
        await h.SettingsFromPropertyInspectorAsync(new SensorKeySettings { SensorId = rx1, Name = "Rad top", Role = "radiator" });
        Assert.Equal("Rad top", svc.CustomName(rx1));
        Assert.Equal("radiator", svc.RoleOverride(rx1));
        Assert.Equal("radiator", globals.GetSection<CoolingGlobalSettings>("cooling").Roles[rx1]);
        Sample.Feed(svc, icue, time, 1);
        await h.AdvanceAsync(TimeSpan.FromSeconds(1));
        Assert.Equal("Rad top", h.Action.LastModel!.Label);

        // Picking another sensor reloads the fields from THAT sensor's shared values, and leaves rx1 alone.
        await h.SettingsFromPropertyInspectorAsync(new SensorKeySettings { SensorId = rx2, Name = "Rad top", Role = "radiator" });
        var saved = h.LastSettingsAs<SensorKeySettings>();
        Assert.Equal("", saved.Name);
        Assert.Equal("auto", saved.Role);
        Assert.Equal("Rad top", svc.CustomName(rx1));
        Assert.Null(svc.CustomName(rx2));
        var state = h.CallsOf("sendToPropertyInspector").Select(c => c.Payload).LastOrDefault(p => p?["type"]?.GetValue<string>() == "pi.state");
        await h.AdvanceAsync(TimeSpan.FromSeconds(1));
        h.AssertFramesAreDeckSafe();
    }

    [Test]
    public async Task Fan_group_key_shows_avg_min_max_of_the_radiator_fans()
    {
        foreach (var (device, at) in KeyPlacements)
        {
            var (svc, icue, _, time, _) = Sample.Service();
            Sample.Feed(svc, icue, time, 2);
            foreach (var n in new[] { 1, 2, 3 }) svc.SetRole(IdOf(svc, $"iCUE LINK RX RGB #{n}: Fan"), "radiator");
            Sample.Feed(svc, icue, time, 2);
            await using var h = await ActionHarness<FanGroupKey>.AppearAsync(device, at, Controller.Keypad, configureServices: s => s.Add(svc));
            var g = svc.Current.Group(FanGroup.Radiator);
            Assert.Equal("RAD FANS", h.Action.LastModel!.Label);
            Assert.Equal(Art.CoolingFormat.Rpm(g.Avg), h.Action.LastModel.Value);
            Assert.Equal(3, h.Action.LastModel.Columns!.Count);
            Assert.Equal("avg RPM", h.Action.LastModel.Sub);
            await h.PressAsync();
            Assert.Equal("min", h.LastSettingsAs<FanGroupSettings>().Stat);
            Assert.Equal(Art.CoolingFormat.Rpm(g.Min), h.Action.LastModel.Value);
            Assert.Equal(1, h.Action.LastModel.Columns!.Count(c => c.Strong));
            await h.PressAsync();
            await h.PressAsync();
            Assert.Equal("avg", h.LastSettingsAs<FanGroupSettings>().Stat);
            Assert.True(h.CallsOf("setImage").All(c => c.Priority == UpdatePriority.Background));
            h.AssertFramesAreDeckSafe();
        }
    }

    [Test]
    public async Task Fan_group_PI_sets_sources_and_roles_of_any_sensor()
    {
        var (svc, icue, _, time, _) = Sample.Service();
        Sample.Feed(svc, icue, time, 2);
        var qx4 = IdOf(svc, "iCUE LINK QX RGB #4: Fan");
        await using var h = await ActionHarness<FanGroupKey>.AppearAsync(TestDevices.Galleon, new(0, 3), Controller.Keypad, configureServices: s => s.Add(svc));
        await h.PropertyInspectorAppearAsync();
        var all = (await h.PiMessageAsync("cooling.sensors", null, 1))!["data"]!.AsArray();
        Assert.Equal(svc.Current.Sensors.Count, all.Count);
        await h.SettingsFromPropertyInspectorAsync(new FanGroupSettings { EditSensorId = qx4 });
        await h.SettingsFromPropertyInspectorAsync(new FanGroupSettings { EditSensorId = qx4, EditRole = "case", EditName = "Front intake", CpuTempSource = "lhm", LhmPort = 8086 });
        Assert.Equal("case", svc.RoleOverride(qx4));
        Assert.Equal("Front intake", svc.CustomName(qx4));
        Assert.Equal("lhm", svc.Settings.CpuTempSource);
        Assert.Equal(8086, svc.Settings.LhmPort);
        h.AssertFramesAreDeckSafe();
    }
}

public class DialActionTests
{
    private static readonly (DeviceInfo Device, Coordinates At)[] DialPlacements =
    [
        (TestDevices.Galleon, new(0, 0)), (TestDevices.Galleon, new(0, 1)), (TestDevices.Galleon, new(1, 0)), (TestDevices.Galleon, new(1, 1)),
        (TestDevices.Plus, new(0, 0)), (TestDevices.Plus, new(3, 0)),
    ];

    [Test]
    public async Task Turn_cycles_views_and_push_toggles_detail_on_every_widget_and_strip_segment()
    {
        foreach (var (device, at) in DialPlacements)
        {
            var (svc, icue, _, time, _) = Sample.Service();
            Sample.Feed(svc, icue, time, 120);
            await using var h = await ActionHarness<CoolingDial>.AppearAsync(device, at, Controller.Encoder, configureServices: s => s.Add(svc));
            Assert.Equal(Layouts.Canvas.Path, h.LastLayout);
            Assert.NotNull(h.FeedbackSvg(Layouts.Canvas.Frame));
            Assert.True(h.CallsOf("setFeedback").All(c => c.Priority == UpdatePriority.Background));

            // A fast Galleon spin aggregates up to ±12 ticks; it is still ONE view step.
            await h.RotateAsync(device.IsGalleon ? 12 : 1);
            Assert.Equal(CoolingDial.Overview, h.LastSettingsAs<CoolingDialSettings>().View);
            await h.RotateAsync(-1);
            Assert.Equal(CoolingDial.Dent, h.LastSettingsAs<CoolingDialSettings>().View);
            await h.RotateAsync(-1);
            Assert.Equal(CoolingDial.PumpView, h.LastSettingsAs<CoolingDialSettings>().View);

            // Short push = details (a long Galleon hold is just a press for us; it never reaches plugins as a gesture).
            await h.DialPressAsync(device.IsGalleon ? TimeSpan.FromSeconds(5) : (TimeSpan?)null);
            Assert.True(h.LastSettingsAs<CoolingDialSettings>().Detail);
            if (device.IsPlus)
            {
                await h.TapAsync(100, 50);
                Assert.False(h.LastSettingsAs<CoolingDialSettings>().Detail);
                await h.TapAsync(100, 50, hold: true);
                Assert.Equal(CoolingDial.Dent, h.LastSettingsAs<CoolingDialSettings>().View);
            }
            else
            {
                await Assert.ThrowsAsync<InvalidOperationException>(() => h.TapAsync(10, 10)); // no touch on Galleon
            }
            var frames = h.Count("setFeedback");
            await h.AdvanceAsync(TimeSpan.FromSeconds(4));
            Assert.InRange(h.Count("setFeedback") - frames, 3, 5);   // 1 Hz when idle
            h.AssertFramesAreDeckSafe();
        }
    }

    [Test]
    public void Every_view_renders_deck_safe_in_Night_and_Day_with_and_without_detail()
    {
        var (svc, icue, _, time, _) = Sample.Service();
        Sample.Feed(svc, icue, time, 300);
        foreach (var n in new[] { 1, 2, 3 }) svc.SetRole(svc.Current.Sensors.First(s => s.OriginalName == $"iCUE LINK RX RGB #{n}: Fan").Id, "radiator");
        foreach (var n in new[] { 1, 2 }) svc.SetRole(svc.Current.Sensors.First(s => s.OriginalName == $"iCUE LINK QX RGB #{n}: Fan").Id, "case");
        Sample.Feed(svc, icue, time, 60, 12);
        foreach (var t in new[] { Refraction.Night, Refraction.Day })
            foreach (var view in CoolingDial.Views)
                foreach (var detail in new[] { false, true })
                {
                    var svg = CoolingDial.Frame(t, svc, new CoolingDialSettings { View = view, Detail = detail }, active: detail).ToSvg();
                    var errors = SvgLint.Check(svg, SvgCanvas.Dial).Where(i => i.Severity == LintSeverity.Error).ToList();
                    Assert.Empty(errors, $"{t.Name}/{view}/{detail}: {string.Join("; ", errors)}");
                    Assert.DoesNotContain("<text", svg);
                    Assert.True(System.Text.RegularExpressions.Regex.Matches(svg, "<(path|rect|circle|line|ellipse|polygon|polyline|stop|mask|filter|linearGradient|radialGradient|fe[A-Z]\\w*)\\b").Count < 150,
                        $"{view}: keep frames light");
                }
    }

    [Test]
    public void Message_view_when_nothing_is_available()
    {
        var (svc, icue, _, _, _) = Sample.Service();
        icue.Set(ProviderState.NotRunning);
        svc.SampleNow();
        var svg = CoolingDial.Frame(Refraction.Night, svc, new CoolingDialSettings(), false).ToSvg();
        Assert.Empty(SvgLint.Check(svg, SvgCanvas.Dial).Where(i => i.Severity == LintSeverity.Error));
        var none = CoolingDial.Frame(Refraction.Day, null, new CoolingDialSettings { View = "fans" }, false).ToSvg();
        Assert.Empty(SvgLint.Check(none, SvgCanvas.Dial).Where(i => i.Severity == LintSeverity.Error));
    }

    [Test]
    public async Task Dial_PI_reports_status_and_lists_sensors()
    {
        var (svc, icue, _, time, _) = Sample.Service();
        Sample.Feed(svc, icue, time, 3);
        await using var h = await ActionHarness<CoolingDial>.AppearAsync(TestDevices.Galleon, new(1, 1), Controller.Encoder, configureServices: s => s.Add(svc));
        await h.PropertyInspectorAppearAsync();
        var hello = await h.PiMessageAsync("pi.ready");
        Assert.Contains("iCUE connected", hello!["data"]!["state"]!["status"]!.GetValue<string>());
        Assert.True(hello["data"]!["form"]!["fields"]!.AsArray().Any(f => f!["setting"]?.GetValue<string>() == "editRole"));
        var list = (await h.PiMessageAsync("cooling.sensors", null, 3))!["data"]!.AsArray();
        Assert.True(list.Count > 10);
    }
}
