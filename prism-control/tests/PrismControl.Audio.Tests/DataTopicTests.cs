using System.Text;
using System.Text.Json.Nodes;
using PrismControl.Audio;
using PrismControl.Core.Data;
using PrismControl.Core.Hosting;
using PrismControl.Testing;
using static PrismControl.Audio.Tests.FakeAudioEngine;

namespace PrismControl.Audio.Tests;

/// <summary>The /v1 audio topics against the fake engine (real time, short waits).</summary>
public class DataTopicTests
{
    private static async Task<JsonNode?> ReadAsync(DataTopic topic)
    {
        var v = await topic.ReadAsync(CancellationToken.None);
        return v is null ? null : JsonNode.Parse(Encoding.UTF8.GetString(v.Body));
    }

    private static async Task<JsonNode> WaitForAsync(DataTopic topic, Func<JsonNode, bool> condition, int timeoutMs = 3000)
    {
        var until = Environment.TickCount64 + timeoutMs;
        JsonNode? last = null;
        while (Environment.TickCount64 < until)
        {
            last = await ReadAsync(topic);
            if (last is not null && condition(last)) return last;
            await Task.Delay(20);
        }
        Assert.Fail($"{topic.Path} never matched; last: {last?.ToJsonString()}");
        return null!;
    }

    private static (DataRegistry Registry, AudioDataProviders Data) Start(FakeAudioEngine f)
    {
        var registry = new DataRegistry();
        var data = new AudioDataProviders(f, registry, TimeProvider.System, NullLog.Instance, CancellationToken.None);
        data.Start();
        return (registry, data);
    }

    [Test]
    public async Task Devices_lists_outputs_and_inputs_with_defaults_volume_and_mute()
    {
        var f = Standard();
        f.External(MixerChat, muted: true);
        f.ExternalDefault(AudioFlow.Render, MixerChat, AudioRole.Communications);
        var (registry, data) = Start(f);
        await using var _ = data;
        Assert.True(data.ClaimedDevices && data.ClaimedMic && data.ClaimedLevels && data.ClaimedSpectrum);
        var j = (await ReadAsync(registry.AudioDevices))!;
        Assert.Equal(Speakers, j["output"]!["defaultId"]!.GetValue<string>());
        Assert.Equal(MixerChat, j["output"]!["defaultCommunicationsId"]!.GetValue<string>());
        var outs = j["output"]!["devices"]!.AsArray();
        Assert.Equal(4, outs.Count);
        var speakers = outs.First(d => d!["id"]!.GetValue<string>() == Speakers)!;
        Assert.Equal("Speakers (Example USB Audio)", speakers["name"]!.GetValue<string>());
        Assert.True(speakers["isDefault"]!.GetValue<bool>());
        Assert.Near(42, speakers["volumePct"]!.GetValue<double>(), 0.01);
        Assert.Equal("active", speakers["state"]!.GetValue<string>());
        Assert.True(outs.First(d => d!["id"]!.GetValue<string>() == MixerChat)!["muted"]!.GetValue<bool>());
        Assert.Equal(2, j["input"]!["devices"]!.AsArray().Count);
    }

    [Test]
    public async Task Mic_publishes_the_default_input_on_every_change()
    {
        var f = Standard();
        var (registry, data) = Start(f);
        await using var _ = data;
        var j = await WaitForAsync(registry.Mic, n => n["deviceId"] is not null);
        Assert.Equal(UsbMic, j["deviceId"]!.GetValue<string>());
        Assert.Equal("Microphone (Example USB Audio)", j["name"]!.GetValue<string>());
        Assert.False(j["muted"]!.GetValue<bool>());
        Assert.True(j["inUse"]!.GetValue<bool>());
        f.External(UsbMic, muted: true);
        await WaitForAsync(registry.Mic, n => n["muted"]!.GetValue<bool>());
        f.ExternalDefault(AudioFlow.Capture, MixerMic, AudioRole.Console);
        j = await WaitForAsync(registry.Mic, n => n["deviceId"]!.GetValue<string>() == MixerMic);
        Assert.Near(100, j["volumePct"]!.GetValue<double>(), 0.01);
    }

    [Test]
    public async Task Mic_peak_is_metered_only_while_polled()
    {
        var f = Standard();
        f.SetMeter(UsbMic, 0.25f, 0.25f);
        var (registry, data) = Start(f);
        await using var _ = data;
        registry.Mic.DemandWindow = TimeSpan.FromMilliseconds(400);
        var j = await WaitForAsync(registry.Mic, n => n["peak"] is JsonValue);
        Assert.Near(0.25, j["peak"]!.GetValue<double>(), 0.0001);
        Assert.Equal(1, f.OpenMeters);
        await Task.Delay(900); // stop polling
        Assert.Equal(0, f.OpenMeters);
        var v = registry.Mic.Current;
        Assert.Null(v?.Peak, "peak is null once metering stops");
    }

    [Test]
    public async Task Levels_meter_only_while_polled()
    {
        var f = Standard();
        f.SetMeter(Speakers, 0.5f, 0.5f, 0.4f);
        f.SetMeter(UsbMic, 0.1f, 0.1f);
        var (registry, data) = Start(f);
        await using var _ = data;
        registry.AudioLevels.DemandWindow = TimeSpan.FromMilliseconds(300);
        Assert.Equal(0, f.OpenMeters);
        var j = await WaitForAsync(registry.AudioLevels, n => n["output"] is JsonObject);
        Assert.Near(0.5, j["output"]!["peak"]!.GetValue<double>(), 0.0001);
        Assert.Near(-6.0, j["output"]!["peakDb"]!.GetValue<double>(), 0.05);
        Assert.Equal(2, j["output"]!["channels"]!.AsArray().Count);
        Assert.Equal("Speakers (Example USB Audio)", j["output"]!["deviceName"]!.GetValue<string>());
        Assert.Near(0.1, j["input"]!["peak"]!.GetValue<double>(), 0.0001);
        Assert.Equal(33, j["intervalMs"]!.GetValue<int>());
        Assert.Equal(2, f.OpenMeters);
        await Task.Delay(800);
        Assert.Equal(0, f.OpenMeters);
    }

    [Test]
    public async Task Silence_reports_a_null_peak_db()
    {
        var f = Standard();
        var (registry, data) = Start(f);
        await using var _ = data;
        var j = await WaitForAsync(registry.AudioLevels, n => n["output"] is JsonObject);
        Assert.Equal(0, j["output"]!["peak"]!.GetValue<double>());
        Assert.Null(j["output"]!["peakDb"]);
    }

    [Test]
    public async Task An_unavailable_engine_serves_no_device_list()
    {
        var f = Standard();
        f.IsAvailable = false;
        var (registry, data) = Start(f);
        await using var _ = data;
        Assert.Null(await ReadAsync(registry.AudioDevices));
    }

    [Test]
    public async Task A_second_provider_does_not_steal_the_topics()
    {
        var f = Standard();
        var (registry, data) = Start(f);
        await using var _ = data;
        await using var second = new AudioDataProviders(f, registry, TimeProvider.System, NullLog.Instance, CancellationToken.None);
        second.Start();
        Assert.False(second.ClaimedDevices || second.ClaimedMic || second.ClaimedLevels || second.ClaimedSpectrum);
    }
}
