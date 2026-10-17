using System.Collections.Concurrent;
using System.Text.Json.Nodes;
using PrismControl.Core.Actions;
using PrismControl.Core.Hosting;
using PrismControl.Core.Scheduling;
using PrismControl.Protocol;

namespace PrismControl.Hosting;

/// <summary>
/// Owns one action instance per context: creates it on willAppear, routes every event into its mailbox,
/// and tears it down after willDisappear. Also implements <see cref="IActionChannel"/> on top of the update
/// scheduler (render updates) and the connection (everything else).
/// </summary>
internal sealed class ActionHost : IActionChannel
{
    private readonly ActionRegistry _registry;
    private readonly UpdateScheduler _scheduler;
    private readonly UpdatePump _pump;
    private readonly StreamDeckConnection _connection;
    private readonly DeviceDirectory _devices;
    private readonly ILog _log;
    private readonly string _pluginUuid;
    private readonly ActionEnvironment _env;
    private readonly ConcurrentDictionary<string, ActionBase> _instances = new(StringComparer.Ordinal);
    private readonly ConcurrentDictionary<Task, byte> _teardowns = new();
    private readonly HashSet<string> _warnedUnknown = [];

    public ActionHost(ActionRegistry registry, UpdateScheduler scheduler, UpdatePump pump, StreamDeckConnection connection,
        DeviceDirectory devices, ILog log, IServiceRegistry services, IGlobalSettings globals, TimeProvider time, string pluginUuid, bool safeMode = false)
    {
        _registry = registry;
        _scheduler = scheduler;
        _pump = pump;
        _connection = connection;
        _devices = devices;
        _log = log;
        _pluginUuid = pluginUuid;
        _env = new ActionEnvironment { Channel = this, Log = log.For("actions"), Services = services, GlobalSettings = globals, Time = time, SafeMode = safeMode };
    }

    public int Count => _instances.Count;

    public void Dispatch(ActionEvent e)
    {
        switch (e)
        {
            case WillAppearEvent a:
                Appear(a);
                break;
            case WillDisappearEvent d:
                if (_instances.TryRemove(d.Context, out var gone))
                {
                    gone.Deliver(d);
                    _scheduler.Forget(d.Context);
                    Track(gone.UnbindAsync());
                }
                break;
            default:
                if (_instances.TryGetValue(e.Context, out var inst)) inst.Deliver(e);
                else _log.Debug($"{e.GetType().Name} for unknown context {e.Context} ({e.ActionUuid})");
                break;
        }
    }

    private void Appear(WillAppearEvent a)
    {
        var device = _devices.GetOrUnknown(a.DeviceId);
        if (_instances.TryGetValue(a.Context, out var existing))
        {
            // A repeated willAppear (e.g. after re-registration) refreshes the existing instance.
            existing.UpdateDevice(device);
            _scheduler.Invalidate(a.Context, _pump.Now);
            existing.Deliver(a);
            return;
        }
        ActionBase? action;
        try { action = _registry.Create(a.ActionUuid); }
        catch (Exception ex)
        {
            _log.Error($"Could not construct {a.ActionUuid}", ex);
            return;
        }
        if (action is null)
        {
            lock (_warnedUnknown)
                if (_warnedUnknown.Add(a.ActionUuid)) _log.Warn($"willAppear for unknown action {a.ActionUuid}; ignored.");
            return;
        }
        action.Bind(_env, a, device);
        _instances[a.Context] = action;
        _scheduler.Invalidate(a.Context, _pump.Now);
        action.Deliver(a);
    }

    /// <summary>Connection lost or shutting down: every instance gets a final willDisappear and is disposed.</summary>
    public async Task ClearAsync()
    {
        foreach (var (ctx, inst) in _instances.ToArray())
        {
            if (!_instances.TryRemove(ctx, out _)) continue;
            inst.Deliver(new WillDisappearEvent(ctx, inst.ActionUuid, inst.Device.Id, inst.Controller, inst.Coordinates));
            Track(inst.UnbindAsync());
        }
        _scheduler.Reset();
        await DrainAsync(TimeSpan.FromSeconds(2)).ConfigureAwait(false);
    }

    public async Task DrainAsync(TimeSpan timeout)
    {
        var pending = _teardowns.Keys.ToArray();
        if (pending.Length == 0) return;
        await Task.WhenAny(Task.WhenAll(pending), Task.Delay(timeout)).ConfigureAwait(false);
    }

    public void OnDeviceChanged(Core.Devices.DeviceInfo device)
    {
        foreach (var inst in _instances.Values)
            if (inst.Device.Id == device.Id) inst.UpdateDevice(device);
    }

    /// <summary>For tests: waits until every instance's mailbox is empty.</summary>
    internal Task WhenIdleAsync() => Task.WhenAll(_instances.Values.Select(i => i.WhenIdleAsync()));

    private void Track(Task t)
    {
        _teardowns[t] = 0;
        _ = t.ContinueWith(done =>
        {
            _teardowns.TryRemove(done, out _);
            if (done.Exception is { } ex) _log.Error("Action teardown failed", ex.GetBaseException());
        }, TaskScheduler.Default);
    }

    // ------------------------------------------------------------------ IActionChannel

    public void SetImage(string context, string? image, int? state, Target target, UpdatePriority priority)
    {
        _scheduler.EnqueueImage(context, image, state, (int)target, priority, _pump.Now);
        _pump.Signal();
    }

    public void SetTitle(string context, string? title, int? state, Target target, UpdatePriority priority)
    {
        _scheduler.EnqueueTitle(context, title, state, (int)target, priority, _pump.Now);
        _pump.Signal();
    }

    public void SetFeedback(string context, JsonObject payload, UpdatePriority priority)
    {
        _scheduler.EnqueueFeedback(context, payload, priority, _pump.Now);
        _pump.Signal();
    }

    public void SetFeedbackLayout(string context, string layout, UpdatePriority priority)
    {
        _scheduler.EnqueueLayout(context, layout, priority, _pump.Now);
        _pump.Signal();
    }

    public void MarkInteractive(string context) => _scheduler.MarkInteractive(context, _pump.Now);

    public void Send(string context, string evt, JsonNode? payload, string? action = null)
    {
        if (!_connection.TrySend(Outbound.Command(evt, context, payload, action: action)))
            _log.Debug($"{evt} for {context} dropped (not connected or over the command rate limit)");
    }

    public void OpenUrl(string url) => _connection.TrySend(Outbound.OpenUrl(url));

    public void LogMessage(string message) => _connection.TrySend(Outbound.LogMessage(message), isLog: true);

    public void SwitchToProfile(string deviceId, string? profile, int? page) =>
        _connection.TrySend(Outbound.SwitchToProfile(_pluginUuid, deviceId, profile, page));
}

/// <summary>Drives the scheduler: pumps due updates into the connection, sleeping until the next one is due.</summary>
internal sealed class UpdatePump
{
    private readonly UpdateScheduler _scheduler;
    private readonly StreamDeckConnection _connection;
    private readonly TimeProvider _time;
    private readonly ILog _log;
    private readonly long _origin;
    private readonly SemaphoreSlim _signal = new(0, 1);

    public UpdatePump(UpdateScheduler scheduler, StreamDeckConnection connection, TimeProvider time, ILog log)
    {
        _scheduler = scheduler;
        _connection = connection;
        _time = time;
        _log = log;
        _origin = time.GetTimestamp();
    }

    public TimeSpan Now => _time.GetElapsedTime(_origin);

    public void Signal()
    {
        try { if (_signal.CurrentCount == 0) _signal.Release(); }
        catch (SemaphoreFullException) { }
    }

    public async Task RunAsync(CancellationToken ct)
    {
        while (!ct.IsCancellationRequested)
        {
            try
            {
                if (!_connection.IsConnected)
                {
                    await WaitAsync(TimeSpan.FromMilliseconds(250), ct).ConfigureAwait(false);
                    continue;
                }
                var result = _scheduler.Pump(Now, 32);
                foreach (var u in result.Updates)
                {
                    if (!await _connection.SendAsync(Outbound.Command(u.Event, u.Context, u.Payload), ct).ConfigureAwait(false))
                        break;
                }
                if (result.Updates.Count > 0) continue;
                var wait = result.NextWake is { } w ? w - Now : Timeout.InfiniteTimeSpan;
                if (wait != Timeout.InfiniteTimeSpan && wait < TimeSpan.FromMilliseconds(1)) wait = TimeSpan.FromMilliseconds(1);
                await WaitAsync(wait, ct).ConfigureAwait(false);
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested) { break; }
            catch (Exception ex)
            {
                _log.Error("Update pump error", ex);
                await Task.Delay(100, CancellationToken.None).ConfigureAwait(false);
            }
        }
    }

    private async Task WaitAsync(TimeSpan timeout, CancellationToken ct)
    {
        try { await _signal.WaitAsync(timeout, ct).ConfigureAwait(false); }
        catch (OperationCanceledException) when (ct.IsCancellationRequested) { throw; }
    }
}
