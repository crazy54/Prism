using System.Text.Json.Serialization.Metadata;

namespace PrismControl.Core.Data;

/// <summary>
/// The data API's endpoints. The standard v1 topics exist up front; a module "registers" as the provider by
/// claiming one (<c>Claim</c> for push, <c>ClaimPull</c>/<c>ClaimProvider</c> for on-demand).
/// Unclaimed or empty topics answer 503 <c>unavailable</c>.
/// </summary>
public interface IDataRegistry
{
    /// <summary>/v1/system: CPU, GPU, RAM, disks, network. Publish at 1 Hz.</summary>
    DataTopic<SystemSnapshot> System { get; }
    /// <summary>/v1/now-playing: publish on change (positionMs + positionAt let clients extrapolate).</summary>
    DataTopic<NowPlayingSnapshot> NowPlaying { get; }
    /// <summary>/v1/now-playing/art: the current album art bytes.</summary>
    BinaryTopic NowPlayingArt { get; }
    /// <summary>/v1/audio/levels: ~30 Hz peaks, only while <see cref="DataTopic.IsDemanded"/>.</summary>
    DataTopic<AudioLevelsSnapshot> AudioLevels { get; }
    /// <summary>/v1/audio/devices: on change (or pull with a short cache).</summary>
    DataTopic<AudioDevicesSnapshot> AudioDevices { get; }
    /// <summary>/v1/mic: mute state on change; peak at 10 Hz while demanded.</summary>
    DataTopic<MicSnapshot> Mic { get; }

    /// <summary>An additional endpoint ("/v1/&lt;name&gt;"); document it in docs/api.md before shipping.</summary>
    DataTopic<T> Custom<T>(string path, JsonTypeInfo<T> typeInfo, TimeSpan cadence) where T : class;

    IReadOnlyList<DataTopic> Topics { get; }
    DataTopic? Find(string path);
}

public sealed class DataRegistry : IDataRegistry
{
    private readonly TimeProvider _time;
    private readonly List<DataTopic> _topics = [];
    private readonly object _gate = new();

    public DataRegistry(TimeProvider? time = null)
    {
        _time = time ?? TimeProvider.System;
        System = Add(new DataTopic<SystemSnapshot>(DataPaths.System, DataJsonContext.Wire.SystemSnapshot, TimeSpan.FromSeconds(1), _time));
        NowPlaying = Add(new DataTopic<NowPlayingSnapshot>(DataPaths.NowPlaying, DataJsonContext.Wire.NowPlayingSnapshot, TimeSpan.Zero, _time));
        NowPlayingArt = Add(new BinaryTopic(DataPaths.NowPlayingArt, TimeSpan.Zero, _time));
        AudioLevels = Add(new DataTopic<AudioLevelsSnapshot>(DataPaths.AudioLevels, DataJsonContext.Wire.AudioLevelsSnapshot, TimeSpan.FromMilliseconds(33), _time));
        AudioDevices = Add(new DataTopic<AudioDevicesSnapshot>(DataPaths.AudioDevices, DataJsonContext.Wire.AudioDevicesSnapshot, TimeSpan.Zero, _time));
        Mic = Add(new DataTopic<MicSnapshot>(DataPaths.Mic, DataJsonContext.Wire.MicSnapshot, TimeSpan.Zero, _time));
    }

    public DataTopic<SystemSnapshot> System { get; }
    public DataTopic<NowPlayingSnapshot> NowPlaying { get; }
    public BinaryTopic NowPlayingArt { get; }
    public DataTopic<AudioLevelsSnapshot> AudioLevels { get; }
    public DataTopic<AudioDevicesSnapshot> AudioDevices { get; }
    public DataTopic<MicSnapshot> Mic { get; }

    public IReadOnlyList<DataTopic> Topics { get { lock (_gate) return [.. _topics]; } }

    public DataTopic? Find(string path)
    {
        lock (_gate) return _topics.FirstOrDefault(t => string.Equals(t.Path, path, StringComparison.Ordinal));
    }

    public DataTopic<T> Custom<T>(string path, JsonTypeInfo<T> typeInfo, TimeSpan cadence) where T : class
    {
        if (!path.StartsWith("/v1/", StringComparison.Ordinal) || path.Contains("..", StringComparison.Ordinal) || path.EndsWith('/'))
            throw new ArgumentException("Custom endpoints must look like /v1/<name>.", nameof(path));
        lock (_gate)
        {
            if (_topics.Any(t => t.Path == path) || path is DataPaths.Health or DataPaths.Index)
                throw new InvalidOperationException($"{path} already exists.");
            var topic = new DataTopic<T>(path, typeInfo, cadence, _time);
            _topics.Add(topic);
            return topic;
        }
    }

    private TTopic Add<TTopic>(TTopic topic) where TTopic : DataTopic
    {
        lock (_gate) _topics.Add(topic);
        return topic;
    }
}
