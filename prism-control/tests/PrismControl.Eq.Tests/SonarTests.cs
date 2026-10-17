using System.Globalization;
using System.Text.Json.Nodes;
using PrismControl.Core.Hosting;
using PrismControl.Eq.Sonar;
using PrismControl.Eq.Tests.Fakes;
using PrismControl.Testing;

namespace PrismControl.Eq.Tests;

public class SonarDiscoveryTests
{
    [Test]
    public async Task Discovers_sonar_through_coreprops_and_the_gg_core_tls()
    {
        await using var rig = await SonarRig.StartAsync();
        var a = await rig.Client.EnsureAsync(CancellationToken.None);
        Assert.True(a.Available, a.Reason + " " + a.Detail);
        Assert.Equal(rig.Sonar.Address + "/", rig.Client.BaseUri?.ToString());
        Assert.Single(rig.Gg.Http.Requests.Where(r => r.Path == "/subApps"));
    }

    [Test]
    public async Task Rejects_a_gg_certificate_with_another_subject()
    {
        await using var evil = new FakeGg("CN=Not SteelSeries");
        var dir = Path.Combine(Path.GetTempPath(), "prism-eq-tests", Guid.NewGuid().ToString("N")[..10]);
        Directory.CreateDirectory(dir);
        try
        {
            var props = Path.Combine(dir, "coreProps.json");
            File.WriteAllText(props, $"{{\"ggEncryptedAddress\":\"{evil.Http.Authority}\"}}");
            using var d = new SonarDiscovery([props], NullLog.Instance);
            var r = await d.DiscoverAsync(CancellationToken.None);
            Assert.False(r.Availability.Available);
            Assert.Null(r.BaseUri);
            Assert.Empty(evil.Http.Requests); // the TLS handshake failed before any request was sent
        }
        finally { Directory.Delete(dir, true); }
    }

    [Test]
    public async Task Reports_gg_not_running_sonar_off_and_sonar_starting()
    {
        // No discovery file at all.
        using (var none = new SonarDiscovery([Path.Combine(Path.GetTempPath(), "prism-eq-tests", "missing", "coreProps.json")], NullLog.Instance))
            Assert.Equal(EqAvailabilityCode.NotRunning, (await none.DiscoverAsync(CancellationToken.None)).Availability.Code);

        await using var rig = await SonarRig.StartAsync();
        rig.Gg.SonarEnabled = false;
        Assert.Equal(EqAvailabilityCode.Disabled, (await rig.Client.EnsureAsync(CancellationToken.None)).Code);
        Assert.Equal("Sonar is turned off in GG.", rig.Client.Availability.Reason);

        rig.Gg.SonarEnabled = true;
        rig.Gg.SonarRunning = false;
        Assert.Equal(EqAvailabilityCode.Starting, (await rig.Client.EnsureAsync(CancellationToken.None, force: true)).Code);

        // A dead GG port (the discovery file is stale): "GG isn't running".
        rig.WriteCoreProps("127.0.0.1:9");
        Assert.Equal(EqAvailabilityCode.NotRunning, (await rig.Client.EnsureAsync(CancellationToken.None, force: true)).Code);
    }

    [Test]
    public async Task Backs_off_while_sonar_is_down_then_recovers()
    {
        await using var rig = await SonarRig.StartAsync();
        rig.Gg.SonarRunning = false;
        await rig.Client.EnsureAsync(CancellationToken.None);
        var calls = rig.Gg.Http.Requests.Count;
        await rig.Client.EnsureAsync(CancellationToken.None); // inside the 1 s backoff: no new discovery
        Assert.Equal(calls, rig.Gg.Http.Requests.Count);
        rig.Gg.SonarRunning = true;
        rig.Time.Advance(TimeSpan.FromSeconds(1.1));
        Assert.True((await rig.Client.EnsureAsync(CancellationToken.None)).Available);
    }

    [Test]
    public void Accepts_bare_and_full_addresses_but_only_loopback()
    {
        Assert.Equal("http://127.0.0.1:51446/", SonarDiscovery.ParseSonarAddress("http://127.0.0.1:51446")?.ToString());
        Assert.Equal("http://127.0.0.1:51446/", SonarDiscovery.ParseSonarAddress("127.0.0.1:51446")?.ToString());
        Assert.Null(SonarDiscovery.ParseSonarAddress("http://192.0.2.10:51446"));
        Assert.Null(SonarDiscovery.ParseSonarAddress(""));
        Assert.True(SonarDiscovery.IsLoopbackHost("localhost"));
        Assert.False(SonarDiscovery.IsLoopbackHost("example.com"));
    }

    [Test]
    public async Task Falls_back_to_the_engine3_discovery_file()
    {
        await using var gg = new FakeGg();
        var dir = Path.Combine(Path.GetTempPath(), "prism-eq-tests", Guid.NewGuid().ToString("N")[..10]);
        Directory.CreateDirectory(dir);
        await using var sonar = new FakeSonar();
        gg.SonarAddress = sonar.Address.Replace("http://", ""); // the older bare "host:port" form
        try
        {
            var engine3 = Path.Combine(dir, "Engine3.json");
            File.WriteAllText(engine3, $"{{\"ggEncryptedAddress\":\"{gg.Http.Authority}\"}}");
            using var d = new SonarDiscovery([Path.Combine(dir, "missing.json"), engine3], NullLog.Instance);
            var r = await d.DiscoverAsync(CancellationToken.None);
            Assert.True(r.Availability.Available, r.Availability.Reason);
            Assert.Equal(sonar.Address + "/", r.BaseUri?.ToString());
        }
        finally { Directory.Delete(dir, true); }
    }
}

public class SonarBackendTests
{
    [Test]
    public async Task Reads_channels_bands_knobs_and_presets()
    {
        await using var rig = await SonarRig.StartAsync();
        var channels = await rig.Backend.GetChannelsAsync(CancellationToken.None);
        Assert.Equal("game,chatRender,media,aux,chatCapture", string.Join(",", channels.Select(c => c.Id)));
        Assert.False(channels.Single(c => c.Id == "media").IsActive);
        Assert.True(channels.Single(c => c.Id == "chatCapture").IsActive);
        Assert.Equal(EqChannelKind.Capture, channels.Single(c => c.Id == "chatCapture").Kind);

        var game = await rig.Backend.GetStateAsync("game", TimeSpan.Zero, CancellationToken.None);
        Assert.Equal(10, game.Bands.Count);
        Assert.Equal(6.0, game.Band(2)!.GainDb);
        Assert.False(game.Band(10)!.Enabled);
        Assert.Equal(1.5, game.Knobs[EqKnob.BassBoost]);
        Assert.True(game.Knobs.ContainsKey(EqKnob.Preamp));
        Assert.Equal("Example Arena", game.ActivePreset?.Name);
        Assert.True(game.ModifiedFromDefault);

        var chat = await rig.Backend.GetStateAsync("chatRender", TimeSpan.Zero, CancellationToken.None);
        Assert.Empty(chat.Knobs);
        Assert.Equal(EqFilterType.LowShelf, chat.Band(1)!.Type);
        Assert.False(chat.ModifiedFromDefault);

        var presets = await rig.Backend.GetPresetsAsync("game", TimeSpan.Zero, CancellationToken.None);
        Assert.Equal(3, presets.Count);
        Assert.Equal(1, presets.Single(p => p.Name == "Example Favorite One").FavoritePosition);
    }

    [Test]
    public async Task A_gain_edit_puts_the_whole_config_back_with_only_that_value_changed()
    {
        await using var rig = await SonarRig.StartAsync();
        var before = rig.Sonar.SelectedConfig("game");
        await rig.Backend.GetStateAsync("game", TimeSpan.Zero, CancellationToken.None);
        var s = rig.Backend.SetGain("game", EqTarget.ForBand(3), -1.5);
        Assert.Equal(-1.5, s.Band(3)!.GainDb);                        // optimistic, at once
        Assert.Empty(rig.Sonar.Puts("/configs"));                     // nothing sent yet (debounce)
        await rig.SettleWritesAsync();
        var put = Assert.Single(rig.Sonar.Puts("/configs"));
        var sent = JsonNode.Parse(put.Body)!.AsObject();
        Assert.Equal(5.0, SonarConfig.Num(sent["schemaVersion"]));   // the schema we read, sent back
        Assert.Equal("by the round trip", sent["data"]!["futureKey"]!["kept"]!.GetValue<string>()); // unknown keys survive
        var expected = (JsonObject)before.DeepClone();
        expected["data"]!["parametricEQ"]!["filter3"]!["gain"] = -1.5;
        Assert.True(JsonNode.DeepEquals(Normalize(expected["data"]), Normalize(sent["data"])), "only filter3.gain may change");
        Assert.True(JsonNode.DeepEquals(Normalize(before["defaultData"]), Normalize(sent["defaultData"])));
        Assert.Equal(-1.5, rig.Sonar.FilterGain("game", 3));
        rig.AssertNoForbiddenCalls();
    }

    [Test]
    public async Task A_two_second_spin_stays_under_sonars_rate_warning_and_lands_on_the_last_value()
    {
        await using var rig = await SonarRig.StartAsync();
        await rig.Backend.GetStateAsync("chatRender", TimeSpan.Zero, CancellationToken.None);
        var gain = 0.0;
        for (var i = 0; i < 60; i++)
        {
            gain = EqMath.StepGain(gain, 1, 0.1, -12, 12);
            rig.Backend.SetGain("chatRender", EqTarget.ForBand(6), gain);
            await rig.RunAsync(TimeSpan.FromMilliseconds(33), TimeSpan.FromMilliseconds(11));
        }
        await rig.SettleWritesAsync();
        var puts = rig.Sonar.Puts("/configs");
        Assert.InRange(puts.Count, 5, 10);
        Assert.Equal(gain, rig.Sonar.FilterGain("chatRender", 6));
        // 2 s of spinning → at most ~4 PUTs/s (the per-500 ms spacing is pinned by CoalescerTests on the manual clock).
        Assert.Equal(puts.Count, rig.Backend.WritesStarted);
    }

    [Test]
    public async Task Reset_uses_the_presets_default_and_bypass_and_eq_switch_edit_the_right_keys()
    {
        await using var rig = await SonarRig.StartAsync();
        await rig.Backend.GetStateAsync("game", TimeSpan.Zero, CancellationToken.None);
        var s = rig.Backend.Reset("game", EqResetScope.Gain, EqTarget.ForBand(2));
        Assert.Equal(2.0, s.Band(2)!.GainDb); // defaultData.filter2.gain
        s = rig.Backend.Reset("game", EqResetScope.Gain, EqTarget.ForKnob(EqKnob.BassBoost));
        Assert.Equal(0.0, s.Knobs[EqKnob.BassBoost]);
        s = rig.Backend.SetBand("game", 4, new EqBandPatch(Enabled: false));
        Assert.False(s.Band(4)!.Enabled);
        s = rig.Backend.SetEnabled("game", EqToggleScope.Eq, false);
        Assert.False(s.Enabled);
        await rig.SettleWritesAsync();
        var stored = rig.Sonar.SelectedConfig("game")["data"]!;
        Assert.Equal(false, stored["parametricEQ"]!["enabled"]!.GetValue<bool>());
        Assert.Equal(false, stored["bassBoostState"]!["enabled"]!.GetValue<bool>()); // the boosts follow the EQ switch
        Assert.Equal(false, stored["parametricEQ"]!["filter4"]!["enabled"]!.GetValue<bool>());
        Assert.Equal(true, stored["globalEnableState"]!.GetValue<bool>());
        s = rig.Backend.SetEnabled("game", EqToggleScope.AllEffects, false);
        Assert.False(s.EffectsEnabled);
        Assert.True(rig.Sonar.Puts("/configs").Count <= 2, "edits in one burst coalesce");
    }

    [Test]
    public async Task Selecting_a_preset_switches_only_that_channel_and_a_deleted_preset_is_reported()
    {
        await using var rig = await SonarRig.StartAsync();
        var s = await rig.Backend.SelectPresetAsync("game", SonarFixtures.Id(2), CancellationToken.None);
        Assert.Equal("Example Favorite One", s.ActivePreset?.Name);
        Assert.Equal(SonarFixtures.Id(2), rig.Sonar.Selected["game"]);
        Assert.Single(rig.Sonar.Requests.Where(r => r.Method == "PUT" && r.Path == $"/configs/{SonarFixtures.Id(2)}/select"));

        // A preset of another channel is refused locally (it would switch that channel).
        await Assert.ThrowsAsync<EqPresetMissingException>(() => rig.Backend.SelectPresetAsync("game", SonarFixtures.Id(11), CancellationToken.None));
        // A deleted preset: gone from the list, so no select is sent.
        await Assert.ThrowsAsync<EqPresetMissingException>(() => rig.Backend.SelectPresetAsync("game", "aaaaaaaa-dead-0000-0000-000000000000", CancellationToken.None));
        Assert.Equal(1, rig.Sonar.Requests.Count(r => r.Path.EndsWith("/select", StringComparison.Ordinal)));
        rig.AssertNoForbiddenCalls();
    }

    [Test]
    public async Task Polling_sees_edits_and_preset_switches_made_in_gg()
    {
        await using var rig = await SonarRig.StartAsync();
        await rig.Backend.PollAsync(CancellationToken.None);
        var events = new List<EqChangedEventArgs>();
        rig.Backend.Changed += (_, e) => { lock (events) events.Add(e); };

        rig.Sonar.Selected["chatRender"] = SonarFixtures.Id(11);           // switched in GG
        rig.Time.Advance(TimeSpan.FromSeconds(2));
        await rig.Backend.PollAsync(CancellationToken.None);
        Assert.Contains("Example Broadcast", events.LastOrDefault(e => e.ChannelId == "chatRender")?.State?.ActivePreset?.Name);
        Assert.True(events.All(e => e.External));

        rig.Sonar.Edit("game", c => c["data"]!["parametricEQ"]!["filter1"]!["gain"] = -7.0); // a band dragged in GG
        rig.Time.Advance(TimeSpan.FromSeconds(9));
        await rig.Backend.PollAsync(CancellationToken.None);
        Assert.Equal(-7.0, rig.Backend.TryGetCachedState("game")!.Band(1)!.GainDb);
    }

    [Test]
    public async Task A_poll_never_clobbers_a_gesture_in_progress()
    {
        await using var rig = await SonarRig.StartAsync();
        await rig.Backend.GetStateAsync("game", TimeSpan.Zero, CancellationToken.None);
        rig.Backend.SetGain("game", EqTarget.ForBand(1), 9);
        rig.Sonar.Edit("game", c => c["data"]!["parametricEQ"]!["filter1"]!["gain"] = -7.0); // a stale GG window writes
        rig.Sonar.Selected["game"] = SonarFixtures.Id(1);
        rig.Time.Advance(TimeSpan.FromMilliseconds(50));
        var s = await rig.Backend.GetStateAsync("game", TimeSpan.Zero, CancellationToken.None); // held: no refetch
        Assert.Equal(9.0, s.Band(1)!.GainDb);
        await rig.SettleWritesAsync();
        Assert.Equal(9.0, rig.Sonar.FilterGain("game", 1)); // last writer wins: ours, consistently
    }

    [Test]
    public async Task Revert_puts_back_the_snapshot_from_before_the_first_edit()
    {
        await using var rig = await SonarRig.StartAsync();
        var original = rig.Sonar.SelectedConfig("game");
        await rig.Backend.GetStateAsync("game", TimeSpan.Zero, CancellationToken.None);
        rig.Backend.SetGain("game", EqTarget.ForBand(5), -9);
        rig.Backend.SetGain("game", EqTarget.ForKnob(EqKnob.TrebleBoost), 4);
        await rig.SettleWritesAsync();
        Assert.True(rig.Backend.HasSessionEdits("game"));
        Assert.True(await rig.Backend.RevertSessionAsync("game", CancellationToken.None));
        Assert.True(JsonNode.DeepEquals(Normalize(original["data"]), Normalize(rig.Sonar.SelectedConfig("game")["data"])));
        Assert.False(await rig.Backend.RevertSessionAsync("game", CancellationToken.None));
    }

    [Test]
    public async Task Rediscovers_when_sonar_moves_to_a_new_port()
    {
        await using var rig = await SonarRig.StartAsync();
        await rig.Backend.GetStateAsync("chatRender", TimeSpan.Zero, CancellationToken.None);
        var oldPort = rig.Client.BaseUri!.Port;
        await rig.RestartSonarOnNewPortAsync();
        var s = await rig.Backend.GetStateAsync("chatRender", TimeSpan.Zero, CancellationToken.None);
        Assert.NotNull(s);
        Assert.NotEqual(oldPort, rig.Client.BaseUri!.Port);
        Assert.True(rig.Client.Availability.Available);
    }

    [Test]
    public async Task Writes_while_sonar_is_down_fail_quietly_and_the_state_reports_it()
    {
        await using var rig = await SonarRig.StartAsync();
        await rig.Backend.GetStateAsync("game", TimeSpan.Zero, CancellationToken.None);
        await rig.Sonar.DisposeAsync();
        rig.Gg.SonarRunning = false;
        rig.Backend.SetGain("game", EqTarget.ForBand(1), 1);
        await rig.SettleWritesAsync();
        Assert.False(rig.Backend.Availability.Available);
        var ex = await Assert.ThrowsAsync<EqUnavailableException>(() => rig.Backend.GetStateAsync("game", TimeSpan.Zero, CancellationToken.None));
        Assert.Equal(EqAvailabilityCode.Starting, ex.Availability.Code);
    }

    /// <summary>Compares numbers by value (Sonar writes 4.0; we write 4).</summary>
    private static JsonNode? Normalize(JsonNode? n) => n switch
    {
        JsonObject o => new JsonObject(o.Select(kv => KeyValuePair.Create(kv.Key, Normalize(kv.Value)))),
        JsonArray a => new JsonArray(a.Select(Normalize).ToArray()),
        JsonValue v when SonarConfig.Num(v) is { } d && v.GetValueKind() == System.Text.Json.JsonValueKind.Number => JsonValue.Create(Math.Round(d, 6)),
        _ => n?.DeepClone(),
    };
}

public class SonarMixerTests
{
    [Test]
    public async Task Volume_paths_are_invariant_culture_and_coalesced()
    {
        var saved = CultureInfo.CurrentCulture;
        CultureInfo.CurrentCulture = new CultureInfo("de-DE"); // "0,5" must never reach Sonar
        try
        {
            await using var rig = await SonarRig.StartAsync();
            var v = await rig.Mixer.GetVolumeAsync(SonarChannels.Game, "monitoring", TimeSpan.Zero, CancellationToken.None);
            Assert.Equal(1.0, v.Volume);
            for (var i = 0; i < 10; i++)
            {
                v = rig.Mixer.SetVolume(SonarChannels.Game, "monitoring", v.Volume - 0.02);
                await rig.RunAsync(TimeSpan.FromMilliseconds(33), TimeSpan.FromMilliseconds(11));
            }
            await rig.SettleWritesAsync();
            var puts = rig.Sonar.Requests.Where(r => r.Method == "PUT" && r.Path.StartsWith("/volumeSettings/classic/game/Volume/", StringComparison.Ordinal)).ToList();
            Assert.InRange(puts.Count, 1, 4);
            Assert.DoesNotContain(",", string.Join(" ", puts.Select(p => p.Path)));
            Assert.Near(0.8, rig.Sonar.Volumes[SonarChannels.Game].Volume, 0.0001);
        }
        finally { CultureInfo.CurrentCulture = saved; }
    }

    [Test]
    public async Task Mute_and_master_use_the_classic_routes()
    {
        await using var rig = await SonarRig.StartAsync();
        await rig.Mixer.GetVolumeAsync(SonarMixer.Master, "monitoring", TimeSpan.Zero, CancellationToken.None);
        rig.Mixer.SetMuted(SonarMixer.Master, "monitoring", true);
        await rig.SettleWritesAsync();
        Assert.Single(rig.Sonar.Requests.Where(r => r.Method == "PUT" && r.Path == "/volumeSettings/classic/Master/Mute/true"));
        Assert.True(rig.Sonar.Volumes[SonarMixer.Master].Muted);
        Assert.Equal("/volumeSettings/streamer/streaming/game/volume/0.5", SonarMixer.VolumePath(true, "streaming", "game", "volume", "0.5"));
        Assert.Equal("/volumeSettings/streamer/monitoring/master/isMuted/true", SonarMixer.VolumePath(true, "monitoring", "master", "mute", "true"));
        rig.AssertNoForbiddenCalls();
    }

    [Test]
    public async Task Chatmix_on_a_hardware_wheel_is_read_only_and_writable_when_enabled()
    {
        await using var rig = await SonarRig.StartAsync();
        rig.Sonar.ChatBalance = 0.25;
        var cm = await rig.Mixer.GetChatMixAsync(TimeSpan.Zero, CancellationToken.None);
        Assert.True(cm.OnHardwareWheel);
        Assert.Equal(75.0, cm.GamePercent);
        rig.Mixer.SetChatMix(-0.5);
        await rig.SettleWritesAsync();
        Assert.Empty(rig.Sonar.Requests.Where(r => r.Method == "PUT" && r.Path == "/v1/chatMix"));

        rig.Sonar.ChatState = "enabled";
        cm = await rig.Mixer.GetChatMixAsync(TimeSpan.Zero, CancellationToken.None);
        Assert.True(cm.CanWrite);
        rig.Mixer.SetChatMix(-0.5);
        await rig.SettleWritesAsync();
        var put = Assert.Single(rig.Sonar.Requests.Where(r => r.Method == "PUT" && r.Path == "/v1/chatMix"));
        Assert.Equal("balance=-0.5", put.Query);
        Assert.Equal(-0.5, rig.Sonar.ChatBalance);
    }
}
