using System.Text.Json.Nodes;
using PrismControl.Core.Devices;
using PrismControl.Core.Layouts;
using PrismControl.Eq.Tests.Fakes;
using PrismControl.Testing;

namespace PrismControl.Eq.Tests;

/// <summary>
/// Review A #7: a Sonar 5xx or non-JSON reply blanked every EQ action (willAppear threw before drawing, every input
/// threw) while the status still said "connected". Each bad reply is driven through the fake Sonar: a 500, an HTML
/// page, truncated JSON and a hung server (client timeout).
/// </summary>
public class SonarFaultTests
{
    private static readonly (string Name, Func<FakeResponse> Reply)[] BadReplies =
        [("HTTP 500", FakeSonar.Bad.ServerError), ("HTML", FakeSonar.Bad.Html), ("truncated JSON", FakeSonar.Bad.TruncatedJson)];

    internal static string Status(JsonNode? hello) => hello?["data"]?["state"]?["status"]?.GetValue<string>() ?? "";

    internal static async Task WaitUntil(Func<bool> condition, string what, int ms = 3000)
    {
        for (var waited = 0; waited < ms; waited += 10)
        {
            if (condition()) return;
            await Task.Delay(10);
        }
        Assert.Fail("timed out waiting until " + what);
    }

    [Test]
    public async Task Every_action_still_draws_a_sonar_error_frame_when_sonar_answers_with_garbage()
    {
        foreach (var (name, reply) in BadReplies)
        {
            await using var rig = await SonarRig.StartAsync();
            Assert.True((await rig.Client.EnsureAsync(CancellationToken.None)).Available, name);
            rig.Sonar.Fault = _ => reply();                     // connected, then every route goes bad

            await using (var h = await ActionHarness<EqBandDial>.AppearAsync(TestDevices.Galleon, new(0, 0), Controller.Encoder,
                settings: new EqBandDialSettings { Channel = "game", Band = "2" }, configureServices: s => s.Add(rig.Service)))
            {
                Assert.NotNull(h.FeedbackSvg(Layouts.Canvas.Frame), $"{name}: the band dial drew nothing");
                Assert.Equal("SONAR ERROR", h.Action.Problem?.ShortText, name);
                await h.RotateAsync(3);
                await h.DialPressAsync();
                var status = Status(await h.PiMessageAsync("pi.ready"));
                Assert.DoesNotContain("connected", status, name);
                Assert.Contains("Sonar", status);
                h.AssertFramesAreDeckSafe();
            }
            await using (var h = await ActionHarness<EqBandBrowserDial>.AppearAsync(TestDevices.Plus, new(1, 0), Controller.Encoder,
                settings: new EqBandBrowserSettings { Channel = "aux" }, configureServices: s => s.Add(rig.Service)))
            {
                Assert.NotNull(h.FeedbackSvg(Layouts.Canvas.Frame), $"{name}: the band browser drew nothing");
                Assert.Equal("SONAR ERROR", h.Action.Problem?.ShortText, name);
                await h.DialPressAsync();
                await h.RotateAsync(2);
                h.AssertFramesAreDeckSafe();
            }
            await using (var h = await ActionHarness<EqPresetKey>.AppearAsync(TestDevices.Galleon, new(1, 1), Controller.Keypad,
                settings: new EqPresetKeySettings { Channel = "game", PresetId = SonarFixtures.Id(3), PresetName = "Example Flat" }, configureServices: s => s.Add(rig.Service)))
            {
                Assert.NotNull(h.LastSvg, $"{name}: the preset key drew nothing");
                Assert.Equal("SONAR ERROR", h.Action.Problem?.ShortText, name);
                await h.PressAsync();
                Assert.Equal(1, h.Count("showAlert"), name);
                h.AssertFramesAreDeckSafe();
            }
            await using (var h = await ActionHarness<EqToggleKey>.AppearAsync(TestDevices.Plus, new(2, 1), Controller.Keypad,
                settings: new EqToggleKeySettings { Channel = "chatRender" }, configureServices: s => s.Add(rig.Service)))
            {
                Assert.NotNull(h.LastSvg, $"{name}: the toggle key drew nothing");
                Assert.Equal("SONAR ERROR", h.Action.Problem?.ShortText, name);
                await h.PressAsync();
                h.AssertFramesAreDeckSafe();
            }
            foreach (var channel in new[] { "master", "chatMix" })
            {
                await using var h = await ActionHarness<SonarVolumeDial>.AppearAsync(TestDevices.Galleon, new(0, 1), Controller.Encoder,
                    settings: new SonarVolumeSettings { Channel = channel }, configureServices: s => s.Add(rig.Service));
                Assert.NotNull(h.FeedbackSvg(Layouts.Canvas.Frame), $"{name}: the {channel} dial drew nothing");
                Assert.Equal("SONAR ERROR", h.Action.Problem?.ShortText, $"{name} {channel}");
                await h.RotateAsync(2);
                await h.DialPressAsync();
                Assert.DoesNotContain("connected", Status(await h.PiMessageAsync("pi.ready")), name);
                h.AssertFramesAreDeckSafe();
            }
            Assert.Empty(rig.Sonar.Writes, $"{name}: nothing may be written while Sonar is failing");
        }
    }

    [Test]
    public async Task A_sonar_500_keeps_the_last_good_frame_backs_off_and_recovers_on_its_own()
    {
        await using var rig = await SonarRig.StartAsync();
        await using var h = await ActionHarness<EqBandDial>.AppearAsync(TestDevices.Galleon, new(0, 0), Controller.Encoder,
            settings: new EqBandDialSettings { Channel = "game", Band = "2" }, configureServices: s => s.Add(rig.Service), time: rig.Time);
        var good = h.Action.CurrentState!;
        Assert.Equal(6.0, good.Band(2)!.GainDb);

        rig.Sonar.Fault = _ => FakeSonar.Bad.ServerError();
        rig.Time.Advance(TimeSpan.FromSeconds(3));                   // the copy is stale: the next gesture re-reads it
        await h.RotateAsync(1);
        await WaitUntil(() => rig.Client.Availability.ShortText == "SONAR ERROR", "the client reports the Sonar error");
        await h.SettleAsync();
        Assert.Equal("SONAR ERROR", h.Action.Problem?.ShortText);
        Assert.Equal(6.0, h.Action.CurrentState!.Band(2)!.GainDb, "no edit on top of an unreadable config");
        // The last good curve stays on the dial, with a "SONAR ERROR" warning (not an offline panel).
        var expected = EqArt.BandDial(h.Action.Theme, new BandFrame("Game", h.Action.CurrentState!, EqTarget.ForBand(2), BandMark.Lit, h.Action.IsInteractive, Warning: "SONAR ERROR"));
        Assert.Equal(expected.ToSvg(), h.FeedbackSvg(Layouts.Canvas.Frame));
        var status = Status(await h.PiMessageAsync("pi.ready"));
        Assert.Contains("HTTP 500", status);
        Assert.DoesNotContain("connected", status);

        // Backs off: more input during the backoff sends nothing to Sonar.
        await Task.Delay(50);
        var sent = rig.Sonar.Requests.Count;
        await h.RotateAsync(1);
        await h.RotateAsync(-2);
        await h.DialPressAsync();
        Assert.Equal(sent, rig.Sonar.Requests.Count);
        Assert.Empty(rig.Sonar.Writes);

        // Recovers on its own: Sonar heals, the backoff ends, the next poll succeeds and the dial redraws normally.
        rig.Sonar.Fault = null;
        rig.Time.Advance(TimeSpan.FromSeconds(31));
        await rig.Backend.PollAsync(CancellationToken.None);
        await WaitUntil(() => rig.Client.Availability.Available, "Sonar is back");
        await h.SettleAsync();
        await Task.Delay(50);
        await h.SettleAsync();
        Assert.Null(h.Action.Problem);
        Assert.Contains("connected", Status(await h.PiMessageAsync("pi.ready")));
        await h.RotateAsync(1);
        Assert.Equal(6.5, h.Action.CurrentState!.Band(2)!.GainDb);
        await rig.SettleWritesAsync();
        Assert.Equal(6.5, rig.Sonar.FilterGain("game", 2));
        h.AssertFramesAreDeckSafe();
    }

    [Test]
    public async Task A_hung_sonar_times_out_into_the_error_state_without_rediscovering_and_recovers()
    {
        await using var rig = await SonarRig.StartAsync(timeout: TimeSpan.FromMilliseconds(300));
        await using var h = await ActionHarness<EqPresetKey>.AppearAsync(TestDevices.Plus, new(0, 0), Controller.Keypad,
            settings: new EqPresetKeySettings { Channel = "game", PresetId = SonarFixtures.Id(1), PresetName = "Example Arena" }, configureServices: s => s.Add(rig.Service), time: rig.Time);
        Assert.True(h.Action.IsActive);
        var discoveries = rig.Gg.Http.Requests.Count;

        rig.Sonar.Fault = _ => FakeSonar.Bad.Hang(TimeSpan.FromSeconds(5));
        rig.Time.Advance(TimeSpan.FromSeconds(3));
        await rig.Backend.PollAsync(CancellationToken.None);         // GET /v1/status hangs: times out after 300 ms
        await WaitUntil(() => rig.Client.Availability.ShortText == "SONAR ERROR", "the client reports the timeout");
        await h.SettleAsync();
        await Task.Delay(50);
        await h.SettleAsync();
        Assert.Equal("SONAR ERROR", h.Action.Problem?.ShortText);
        Assert.True(h.Action.IsActive, "the key keeps its last good state");
        Assert.Contains("time", Status(await h.PiMessageAsync("pi.ready")));
        await h.PressAsync();                                        // during the backoff: an alert, and no request at all
        Assert.Equal(1, h.Count("showAlert"));
        Assert.Equal(discoveries, rig.Gg.Http.Requests.Count);       // a hung port is not a moved port: no re-discovery storm
        Assert.Empty(rig.Sonar.Writes);
        h.AssertFramesAreDeckSafe();

        rig.Sonar.Fault = null;
        rig.Time.Advance(TimeSpan.FromSeconds(31));
        await rig.Backend.PollAsync(CancellationToken.None);
        await WaitUntil(() => rig.Client.Availability.Available, "Sonar is back");
        await h.SettleAsync();
        await Task.Delay(50);
        await h.SettleAsync();
        Assert.Null(h.Action.Problem);
        Assert.True(h.Action.IsActive);
    }
}
