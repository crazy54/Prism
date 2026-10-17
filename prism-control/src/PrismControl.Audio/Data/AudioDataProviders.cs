using PrismControl.Core.Data;
using PrismControl.Core.Hosting;

namespace PrismControl.Audio;

/// <summary>
/// The audio topics of the data API (docs/api.md §4.6-4.8), built on <see cref="IAudioEngine"/> so tests can drive them:
/// <list type="bullet">
/// <item><c>/v1/audio/devices</c>: pull, cached 500 ms, from the engine's live cache.</item>
/// <item><c>/v1/mic</c>: pushed on every mute/volume/default change of the default (console) input; while polled,
/// the peak is metered at 10 Hz and "in use" refreshed every second.</item>
/// <item><c>/v1/audio/levels</c>: metered at ~30 Hz only while polled (stops 5 s after the last request).</item>
/// </list>
/// </summary>
internal sealed class AudioDataProviders : IAsyncDisposable
{
    public static readonly TimeSpan LevelsInterval = TimeSpan.FromMilliseconds(33);
    public static readonly TimeSpan MicInterval = TimeSpan.FromMilliseconds(100);
    public static readonly TimeSpan InUseRefresh = TimeSpan.FromSeconds(1);

    private readonly IAudioEngine _engine;
    private readonly IDataRegistry _data;
    private readonly TimeProvider _time;
    private readonly ILog _log;
    private readonly CancellationTokenSource _cts;
    private DataPublisher<MicSnapshot>? _mic;
    private DataPublisher<AudioLevelsSnapshot>? _levels;
    private int _micDirty, _micPublishing, _micLoop, _levelsLoop;
    private bool? _inUse;
    private double? _micPeak;
    private Task _micLoopTask = Task.CompletedTask, _levelsLoopTask = Task.CompletedTask;

    public AudioDataProviders(IAudioEngine engine, IDataRegistry data, TimeProvider time, ILog log, CancellationToken shutdown)
    {
        _engine = engine;
        _data = data;
        _time = time;
        _log = log;
        _cts = CancellationTokenSource.CreateLinkedTokenSource(shutdown);
    }

    public bool ClaimedDevices { get; private set; }
    public bool ClaimedMic => _mic is not null;
    public bool ClaimedLevels => _levels is not null;

    public void Start()
    {
        ClaimedDevices = _data.AudioDevices.ClaimPull("audio", _ => ValueTask.FromResult(BuildDevices()), TimeSpan.FromMilliseconds(500));
        _mic = _data.Mic.Claim("audio", TimeSpan.Zero);
        if (_mic is not null)
        {
            _engine.Changed += OnEngineChanged;
            _mic.DemandStarted += (_, _) => StartMicLoop();
            RequestMicPublish();
        }
        _levels = _data.AudioLevels.Claim("audio", LevelsInterval);
        if (_levels is not null) _levels.DemandStarted += (_, _) => StartLevelsLoop();
        if (!ClaimedDevices || _mic is null || _levels is null)
            _log.Warn("Another provider already owns some audio data topics; Prism Control's audio module serves the rest.");
    }

    // ---------------------------------------------------------------- /v1/audio/devices

    internal AudioDevicesSnapshot? BuildDevices()
    {
        if (!_engine.IsAvailable) return null;
        return new AudioDevicesSnapshot { Output = List(AudioFlow.Render), Input = List(AudioFlow.Capture) };

        AudioDeviceList List(AudioFlow flow)
        {
            var def = _engine.GetDefaultId(flow, AudioRole.Console);
            var comms = _engine.GetDefaultId(flow, AudioRole.Communications);
            return new AudioDeviceList
            {
                DefaultId = def,
                DefaultCommunicationsId = comms,
                Devices = _engine.GetDevices(flow).Select(d => new AudioDeviceInfo
                {
                    Id = d.Id,
                    Name = d.FriendlyName,
                    IsDefault = d.Id == def,
                    IsDefaultCommunications = d.Id == comms,
                    VolumePct = Math.Round(d.Volume * 100.0, 1),
                    Muted = d.Muted,
                    State = "active",
                }).ToList(),
            };
        }
    }

    // ---------------------------------------------------------------- /v1/mic

    private string? MicId => _engine.GetDefaultId(AudioFlow.Capture, AudioRole.Console);

    private void OnEngineChanged(AudioChange c)
    {
        var relevant = c.Kind switch
        {
            AudioChangeKind.Endpoint => c.DeviceId == MicId,
            AudioChangeKind.Defaults => c.Flow is null or AudioFlow.Capture,
            AudioChangeKind.Sessions => false,
            _ => true,
        };
        if (relevant) RequestMicPublish();
    }

    /// <summary>Coalesces bursts of changes into one publish at a time (the latest state wins).</summary>
    internal void RequestMicPublish()
    {
        Interlocked.Exchange(ref _micDirty, 1);
        if (Interlocked.CompareExchange(ref _micPublishing, 1, 0) != 0) return;
        _ = Task.Run(async () =>
        {
            try
            {
                while (Interlocked.Exchange(ref _micDirty, 0) == 1)
                    await PublishMicAsync(refreshInUse: true).ConfigureAwait(false);
            }
            catch (Exception ex) { _log.Warn("publishing /v1/mic failed", ex); }
            finally
            {
                Volatile.Write(ref _micPublishing, 0);
                if (Volatile.Read(ref _micDirty) == 1 && !_cts.IsCancellationRequested) RequestMicPublish();
            }
        });
    }

    internal async Task PublishMicAsync(bool refreshInUse)
    {
        if (_mic is null) return;
        var id = MicId;
        var d = id is null ? null : _engine.GetDevice(id);
        if (refreshInUse) _inUse = d is null ? null : await _engine.IsCaptureInUseAsync(d.Id).ConfigureAwait(false);
        _mic.Publish(new MicSnapshot
        {
            DeviceId = d?.Id,
            Name = d?.FriendlyName,
            Muted = d?.Muted ?? false,
            VolumePct = d is null ? null : Math.Round(d.Volume * 100.0, 1),
            Peak = d is null ? null : _micPeak,
            InUse = d is null ? null : _inUse,
        });
    }

    private void StartMicLoop()
    {
        if (_mic is null || Interlocked.CompareExchange(ref _micLoop, 1, 0) != 0) return;
        _micLoopTask = Task.Run(MicLoopAsync);
    }

    private async Task MicLoopAsync()
    {
        using var meter = new MeterBinding(_engine);
        try
        {
            using var timer = new PeriodicTimer(MicInterval, _time);
            var lastInUse = long.MinValue;
            do
            {
                if (!_mic!.IsDemanded) break;
                var reading = meter.Read(MicId);
                _micPeak = Math.Round(reading.Peak, 4);
                var refresh = lastInUse == long.MinValue || _time.GetElapsedTime(lastInUse) >= InUseRefresh;
                if (refresh) lastInUse = _time.GetTimestamp();
                await PublishMicAsync(refresh).ConfigureAwait(false);
            }
            while (await timer.WaitForNextTickAsync(_cts.Token).ConfigureAwait(false));
        }
        catch (OperationCanceledException) { }
        catch (Exception ex) { _log.Warn("mic metering stopped", ex); }
        finally
        {
            _micPeak = null;
            meter.Close();
            Volatile.Write(ref _micLoop, 0);
            if (!_cts.IsCancellationRequested) RequestMicPublish(); // drop the peak: "null unless metering is running"
        }
    }

    // ---------------------------------------------------------------- /v1/audio/levels

    private void StartLevelsLoop()
    {
        if (_levels is null || Interlocked.CompareExchange(ref _levelsLoop, 1, 0) != 0) return;
        _levelsLoopTask = Task.Run(LevelsLoopAsync);
    }

    private async Task LevelsLoopAsync()
    {
        using var output = new MeterBinding(_engine);
        using var input = new MeterBinding(_engine);
        try
        {
            using var timer = new PeriodicTimer(LevelsInterval, _time);
            do
            {
                if (!_levels!.IsDemanded) break;
                _levels.Publish(new AudioLevelsSnapshot
                {
                    Output = Level(output, _engine.GetDefaultId(AudioFlow.Render, AudioRole.Console)),
                    Input = Level(input, _engine.GetDefaultId(AudioFlow.Capture, AudioRole.Console)),
                    IntervalMs = (int)LevelsInterval.TotalMilliseconds,
                });
            }
            while (await timer.WaitForNextTickAsync(_cts.Token).ConfigureAwait(false));
        }
        catch (OperationCanceledException) { }
        catch (Exception ex) { _log.Warn("level metering stopped", ex); }
        finally
        {
            output.Close();
            input.Close();
            Volatile.Write(ref _levelsLoop, 0);
        }
    }

    private LevelInfo? Level(MeterBinding meter, string? deviceId)
    {
        var d = deviceId is null ? null : _engine.GetDevice(deviceId);
        if (d is null)
        {
            meter.Close();
            return null;
        }
        var r = meter.Read(d.Id);
        return new LevelInfo
        {
            DeviceId = d.Id,
            DeviceName = d.FriendlyName,
            Peak = Math.Round(r.Peak, 4),
            PeakDb = r.PeakDb,
            Channels = r.Channels.Length == 0 ? null : r.Channels.Select(c => Math.Round((double)c, 4)).ToList(),
        };
    }

    public async ValueTask DisposeAsync()
    {
        _engine.Changed -= OnEngineChanged;
        _cts.Cancel();
        try { await Task.WhenAll(_micLoopTask, _levelsLoopTask).WaitAsync(TimeSpan.FromSeconds(1)).ConfigureAwait(false); }
        catch (Exception) { /* shutting down */ }
        _cts.Dispose();
    }
}
