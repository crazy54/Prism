using System.Diagnostics;
using System.Text.RegularExpressions;
using System.Threading.Channels;
using PrismControl.Core.Hosting;
using PrismControl.Cooling.Icue.QtRo;

namespace PrismControl.Cooling.Icue;

public sealed class IcueOptions
{
    /// <summary>iCUE's widget sensor provider pipe (the suffix is a per-install hash, so it is discovered by prefix).</summary>
    public string WidgetPipePrefix { get; init; } = "Corsair_WB_Plugin_Sensors_";
    /// <summary>iCUE's automation SDK pipe (what Corsair's Stream Deck plugin uses). The fallback.</summary>
    public string AutomationPipe { get; init; } = "corsair_automation_sdk";
    /// <summary>Lists the names under \\.\pipe\ (tests substitute their own).</summary>
    public Func<IEnumerable<string>> ListPipes { get; init; } = DefaultListPipes;
    /// <summary>Refuse a pipe unless iCUE serves it (guards against a squatting process feeding fake data).</summary>
    public bool VerifyServerProcess { get; init; } = true;
    public TimeSpan ConnectTimeout { get; init; } = TimeSpan.FromMilliseconds(1500);
    public TimeSpan CallTimeout { get; init; } = TimeSpan.FromSeconds(3);
    /// <summary>Automation pipe: GetSensors() cadence (p50 0.74 ms per call on this PC).</summary>
    public TimeSpan PollInterval { get; init; } = TimeSpan.FromSeconds(1);
    /// <summary>Widget pipe: re-list ids and re-read quiet sensors this often (signals do the rest).</summary>
    public TimeSpan RefreshInterval { get; init; } = TimeSpan.FromSeconds(30);
    /// <summary>A widget sensor with no value signal for this long is re-read directly.</summary>
    public TimeSpan QuietAfter { get; init; } = TimeSpan.FromSeconds(15);
    public TimeSpan BackoffMin { get; init; } = TimeSpan.FromSeconds(1);
    public TimeSpan BackoffMax { get; init; } = TimeSpan.FromSeconds(15);

    public static IEnumerable<string> DefaultListPipes()
    {
        try { return Directory.EnumerateFiles(@"\\.\pipe\").Select(p => p.Length > 9 ? p[9..] : p).ToList(); }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or ArgumentException) { return []; }
    }
}

/// <summary>
/// Reads fan, pump, coolant and CPU-package sensors from Corsair iCUE over its local Qt Remote Objects pipes. READ-ONLY.
/// <para>
/// <b>Pipe choice.</b> Primary: the widget <c>SensorProvider</c> (<c>\\.\pipe\Corsair_WB_Plugin_Sensors_*</c>). It is the
/// richest source: per-sensor device name ("iCUE LINK System Hub"), explicit type/kind ("pump", "package"), units,
/// two-decimal values, the AIO <b>coolant temperature</b> and the QX fans' air probes (both missing from the automation
/// pipe), and push signals (~1 Hz per LINK sensor) instead of polling. Fallback: the automation SDK
/// (<c>\\.\pipe\corsair_automation_sdk</c>, <c>GetSensors()</c>): integer values, no device names, no LINK temperatures.
/// </para>
/// <para>
/// <b>Candidates.</b> Every listed widget pipe, then the automation pipe. The server must be iCUE (checked before a byte
/// is read) and the pipe is opened for identification only. A pipe that fails (a squatter, a hung or foreign server)
/// is remembered and goes to the back of the line with a cool-down, so it can never block the real one. While on the
/// automation pipe, the widget pipe is picked up as soon as it appears (iCUE starts the widget host later).
/// </para>
/// <para>
/// <b>Stable ids.</b> Ids hash device|name|type|kind. The automation pipe has no device names for non-LINK devices, so
/// once both pipes have been seen a sensor keeps the widget pipe's id on either pipe; a sensor renamed in iCUE (same
/// native id, new name) gets its old id as an alias. Settings and keys bound to an alias follow the sensor.
/// </para>
/// Reconnects with backoff (1 s → 15 s) when iCUE restarts. Only methods in <see cref="IcueSafety"/> are ever invoked.
/// </summary>
public sealed partial class IcueProvider : ICoolingProvider
{
    public const string ProviderName = "icue";
    public const string LinkHubDevice = "iCUE LINK System Hub";

    /// <summary>How long a pipe whose server is not iCUE is left alone.</summary>
    public static readonly TimeSpan UntrustedCooldown = TimeSpan.FromMinutes(10);
    /// <summary>The longest cool-down after repeated failures of an iCUE-looking pipe.</summary>
    public static readonly TimeSpan MaxCooldown = TimeSpan.FromMinutes(5);
    /// <summary>On the automation pipe, look for the widget pipe at least this often.</summary>
    public static readonly TimeSpan MaxUpgradeCheck = TimeSpan.FromSeconds(5);

    private static readonly string[] WidgetRequired =
        ["getAllSensorIds()", "getSensorValue(QString)", "getSensorUnits(QString)", "getSensorName(QString)", "getSensorDeviceName(QString)", "getSensorType(QString)", "getSensorKind(QString)", "sensorIsConnected(QString)"];

    private readonly IcueOptions _o;
    private readonly ILog _log;
    private readonly TimeProvider _time;
    private readonly object _gate = new();
    private CancellationTokenSource? _cts;
    private Task? _loop;
    private ProviderReading _current = ProviderReading.Off;
    private string? _lastLogged;

    // Loop-only state (one connection loop at a time; it survives reconnects, so what was learned is kept).
    private readonly Dictionary<string, PipeRecord> _pipes = new(StringComparer.OrdinalIgnoreCase);
    private readonly Dictionary<string, (string Id, string Name, string Device)> _byNative = new(StringComparer.Ordinal); // pipe:native → last seen
    private readonly Dictionary<string, string> _renamedTo = new(StringComparer.Ordinal);     // old id → current id
    private readonly Dictionary<string, string> _autoToWidget = new(StringComparer.Ordinal);  // automation id → widget id
    private readonly Dictionary<string, string> _deviceClass = new(StringComparer.Ordinal);
    private List<(string Id, string Key)> _widgetKeys = [], _automationKeys = [];
    private bool _sessionConnected;

    private sealed class PipeRecord
    {
        public int Failures;
        public long RetryAt;
    }

    private enum SessionEnd { Closed, Upgrade }

    public IcueProvider(ILog? log = null, TimeProvider? time = null, IcueOptions? options = null)
    {
        _log = log ?? NullLog.Instance;
        _time = time ?? TimeProvider.System;
        _o = options ?? new IcueOptions();
    }

    public string Name => ProviderName;
    public bool Wanted { get; set; } = true;
    public ProviderReading Current { get { lock (_gate) return _current; } }
    /// <summary>"widget" or "automation" while connected (null otherwise).</summary>
    public string? ConnectedPipe { get; private set; }

    public void Start()
    {
        lock (_gate)
        {
            if (_loop is not null) return;
            _cts = new CancellationTokenSource();
            var ct = _cts.Token;
            _current = new ProviderReading(ProviderState.Connecting, "Looking for iCUE…", []);
            _loop = Task.Run(() => RunAsync(ct));
        }
    }

    public async Task StopAsync()
    {
        Task? loop;
        CancellationTokenSource? cts;
        lock (_gate)
        {
            loop = _loop;
            cts = _cts;
            _loop = null;
            _cts = null;
        }
        if (cts is null) return;
        await cts.CancelAsync().ConfigureAwait(false);
        if (loop is not null) { try { await loop.ConfigureAwait(false); } catch (OperationCanceledException) { } }
        cts.Dispose();
        lock (_gate) _current = ProviderReading.Off;
        ConnectedPipe = null;
    }

    public ValueTask DisposeAsync() => new(StopAsync());

    private void SetState(ProviderState state, string detail, IReadOnlyList<RawSensor>? sensors = null)
    {
        lock (_gate)
        {
            if (_loop is null && state != ProviderState.Off) return; // stopped meanwhile
            _current = new ProviderReading(state, detail, sensors ?? (state == ProviderState.Connected ? _current.Sensors : []));
        }
        var line = $"{state}: {detail}";
        if (line != _lastLogged)
        {
            _lastLogged = line;
            if (state is ProviderState.Error) _log.Warn("iCUE " + line);
            else _log.Info("iCUE " + line);
        }
    }

    private void Publish(IReadOnlyList<RawSensor> sensors, string detail)
    {
        lock (_gate)
        {
            if (_loop is null) return;
            _current = new ProviderReading(ProviderState.Connected, detail, sensors);
        }
    }

    // ------------------------------------------------------------------ connection loop

    private async Task RunAsync(CancellationToken ct)
    {
        var backoff = _o.BackoffMin;
        while (!ct.IsCancellationRequested)
        {
            var candidates = Candidates();
            var pick = candidates.FirstOrDefault(c => Eligible(c.Pipe));
            if (pick.Pipe is null)
            {
                // No pipe at all: iCUE is not running. Pipes that all failed recently: keep the last error and wait.
                if (candidates.Count == 0) SetState(ProviderState.NotRunning, "iCUE is not running (no sensor pipe found)");
                var wait = candidates.Count == 0 ? backoff : Min(backoff, UntilRetry(candidates));
                if (!await DelayAsync(wait, ct)) break;
                backoff = Next(backoff);
                continue;
            }

            SessionEnd end = SessionEnd.Closed;
            string? error = null;
            var errorState = ProviderState.Error;
            var untrusted = false;
            _sessionConnected = false;
            try
            {
                // The server check runs inside ConnectAsync, before the client reads anything from the pipe.
                await using var client = await QtRoClient.ConnectAsync(pick.Pipe, _o.ConnectTimeout, ct, _o.VerifyServerProcess ? new Action<int?>(VerifyServer) : null).ConfigureAwait(false);
                end = pick.Widget
                    ? await RunWidgetSessionAsync(client, ct).ConfigureAwait(false)
                    : await RunAutomationSessionAsync(client, ct).ConfigureAwait(false);
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested) { break; }
            catch (OperationCanceledException) { error = "iCUE removed its sensor object; reconnecting…"; errorState = ProviderState.Connecting; }
            catch (IcueSafetyException ex) { error = ex.Message; untrusted = true; }
            catch (TimeoutException) { error = "iCUE is starting (no answer yet)"; errorState = ProviderState.Connecting; }
            catch (Exception ex) when (ex is IOException or InvalidDataException or KeyNotFoundException or UnauthorizedAccessException or ObjectDisposedException or InvalidCastException or FormatException)
            {
                error = "iCUE: " + ex.Message;
            }
            catch (Exception ex)
            {
                // A bug must not end the loop for good: log it and retry with backoff.
                _log.Error("iCUE provider failed unexpectedly", ex);
                error = "iCUE: unexpected error (see log)";
            }
            ConnectedPipe = null;
            if (ct.IsCancellationRequested) break;

            if (_sessionConnected)
            {
                _pipes.Remove(pick.Pipe); // it works: no failure on record
                backoff = _o.BackoffMin;
                if (end == SessionEnd.Upgrade) continue; // straight to the widget pipe; the last readings stay until it answers
                SetState(error is null ? ProviderState.Connecting : errorState, error ?? "iCUE closed the connection; reconnecting…");
                if (!await DelayAsync(backoff, ct)) break;
                continue;
            }

            // Failed before it delivered anything: remember it and try the next candidate right away.
            RecordFailure(pick, untrusted, error);
            if (Candidates().Any(c => Eligible(c.Pipe))) continue;
            SetState(errorState, error ?? "iCUE closed the connection; reconnecting…");
            if (!await DelayAsync(backoff, ct)) break;
            backoff = Next(backoff);
        }
    }

    /// <summary>The sensor pipes to try, best first: widget pipes before the automation pipe; within each, the names that
    /// failed least, then by name.</summary>
    private List<(string Pipe, bool Widget)> Candidates()
    {
        List<string> names;
        try { names = _o.ListPipes().ToList(); }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or ArgumentException) { names = []; }
        var list = names.Where(n => n.StartsWith(_o.WidgetPipePrefix, StringComparison.OrdinalIgnoreCase))
            .Distinct(StringComparer.OrdinalIgnoreCase).Select(n => (Pipe: n, Widget: true)).ToList();
        if (names.Any(n => string.Equals(n, _o.AutomationPipe, StringComparison.OrdinalIgnoreCase))) list.Add((_o.AutomationPipe, false));
        return [.. list.OrderBy(c => c.Widget ? 0 : 1).ThenBy(c => _pipes.TryGetValue(c.Pipe, out var r) ? r.Failures : 0).ThenBy(c => c.Pipe, StringComparer.Ordinal)];
    }

    private bool Eligible(string pipe) => !_pipes.TryGetValue(pipe, out var r) || _time.GetTimestamp() >= r.RetryAt;

    private TimeSpan UntilRetry(List<(string Pipe, bool Widget)> candidates)
    {
        var next = candidates.Select(c => _pipes.TryGetValue(c.Pipe, out var r) ? r.RetryAt : 0).Min();
        return TimeSpan.FromSeconds(Math.Max(0, (next - _time.GetTimestamp()) / (double)_time.TimestampFrequency));
    }

    private void RecordFailure((string Pipe, bool Widget) pipe, bool untrusted, string? error)
    {
        if (!_pipes.TryGetValue(pipe.Pipe, out var r)) _pipes[pipe.Pipe] = r = new PipeRecord();
        r.Failures++;
        var cooldown = untrusted
            ? UntrustedCooldown
            : TimeSpan.FromTicks(Math.Min(MaxCooldown.Ticks, _o.BackoffMin.Ticks << Math.Min(r.Failures - 1, 20)));
        r.RetryAt = _time.GetTimestamp() + (long)(cooldown.TotalSeconds * _time.TimestampFrequency);
        if (r.Failures == 1)
            _log.Warn($"iCUE: the {(pipe.Widget ? "widget" : "automation")} sensor pipe failed ({error ?? "closed"}); trying the next one, this one again in {cooldown.TotalSeconds:0} s.");
    }

    private static void VerifyServer(int? serverPid)
    {
        var pid = serverPid ?? throw new IcueSafetyException("Could not identify the process serving the iCUE pipe; not reading it.");
        string name;
        try { using var p = Process.GetProcessById(pid); name = p.ProcessName; }
        catch (ArgumentException) { throw new IOException("The iCUE pipe server exited."); }
        if (!name.StartsWith("iCUE", StringComparison.OrdinalIgnoreCase) && !name.Contains("Corsair", StringComparison.OrdinalIgnoreCase))
            throw new IcueSafetyException($"The sensor pipe is served by '{name}', not iCUE; not reading it.");
    }

    private TimeSpan Next(TimeSpan t) => TimeSpan.FromTicks(Math.Min(_o.BackoffMax.Ticks, t.Ticks * 2));

    private async Task<bool> DelayAsync(TimeSpan t, CancellationToken ct)
    {
        try { await Task.Delay(t, _time, ct).ConfigureAwait(false); return true; }
        catch (OperationCanceledException) { return false; }
    }

    // ------------------------------------------------------------------ widget SensorProvider session

    private sealed class WidgetSensor
    {
        public required string NativeId;
        public string Name = "";
        public string Device = "";
        public RawSensorType Type;
        public string Kind = "default";
        public string Unit = "";
        public bool Connected;
        public double? Value;
        public long UpdatedTicks;
    }

    /// <summary>Runs until the connection ends; sets <see cref="_sessionConnected"/> once readings are published.</summary>
    private async Task<SessionEnd> RunWidgetSessionAsync(QtRoClient c, CancellationToken ct)
    {
        var objects = await c.WaitObjectsAsync(_o.CallTimeout, ct).ConfigureAwait(false);
        var obj = objects.FirstOrDefault(o => o.TypeName == IcueSafety.SensorProviderType)
            ?? throw new InvalidDataException("the widget pipe has no SensorProvider object");
        var def = await c.AcquireAsync(obj.Name, _o.CallTimeout, ct).ConfigureAwait(false);
        if (def.TypeName != IcueSafety.SensorProviderType) throw new InvalidDataException("unexpected replica type " + def.TypeName);
        foreach (var sig in WidgetRequired)
            if (def.MethodIndex(sig) < 0) throw new KeyNotFoundException($"this iCUE version has no {sig}");

        var sigValue = def.SignalIndex("sensorValueChanged(QString,QString)");
        var sigUnits = def.SignalIndex("sensorUnitsChanged(QString,QString)");
        var sigAdded = def.SignalIndex("sensorAdded(QString)");
        var sigRemoved = def.SignalIndex("sensorRemoved(QString)");
        var sigData = def.SignalIndex("sensorDataChanged(QString)");

        var sensors = new Dictionary<string, WidgetSensor>(StringComparer.Ordinal);
        var ignored = new HashSet<string>(StringComparer.Ordinal);
        var pendingFetch = new HashSet<string>(StringComparer.Ordinal);
        var gate = new object();
        var work = Channel.CreateUnbounded<(bool Remove, string Id)>(new UnboundedChannelOptions { SingleReader = true });

        c.SignalReceived = (_, index, args) =>
        {
            if (args.Count == 0 || args[0] is not string id) return;
            lock (gate)
            {
                if (index == sigValue && args.Count >= 2)
                {
                    if (sensors.TryGetValue(id, out var s))
                    {
                        s.Value = Number(args[1] as string, s.Unit);
                        s.UpdatedTicks = _time.GetTimestamp();
                    }
                    else if (!ignored.Contains(id) && pendingFetch.Add(id)) work.Writer.TryWrite((false, id));
                }
                else if (index == sigUnits && args.Count >= 2 && sensors.TryGetValue(id, out var u)) u.Unit = args[1] as string ?? u.Unit;
                else if ((index == sigAdded || index == sigData) && pendingFetch.Add(id)) { ignored.Remove(id); work.Writer.TryWrite((false, id)); }
                else if (index == sigRemoved) work.Writer.TryWrite((true, id));
            }
        };
        using var sessionCts = CancellationTokenSource.CreateLinkedTokenSource(ct);
        c.ObjectRemoved = _ => sessionCts.Cancel();
        var sct = sessionCts.Token;

        Task<object?> Call(string sig, string? arg = null) =>
            c.InvokeAsync(def, obj.Name, sig, arg is null ? [] : [arg], _o.CallTimeout, sct);

        async Task FetchAsync(IReadOnlyCollection<string> ids)
        {
            if (ids.Count == 0) return;
            var typeTasks = ids.Select(id => Call("getSensorType(QString)", id)).ToList();
            var types = await Task.WhenAll(typeTasks).ConfigureAwait(false);
            var candidates = new List<(string Id, RawSensorType Type)>();
            var i = 0;
            foreach (var id in ids)
            {
                var t = (types[i++] as string)?.Trim().ToLowerInvariant();
                RawSensorType? rt = t switch { "fan" => RawSensorType.Fan, "pump" => RawSensorType.Pump, "temperature" => RawSensorType.Temperature, _ => null };
                if (rt is { } r) candidates.Add((id, r));
                else lock (gate) { ignored.Add(id); pendingFetch.Remove(id); }
            }
            var details = await Task.WhenAll(candidates.Select(async x =>
            {
                var parts = await Task.WhenAll(
                    Call("getSensorName(QString)", x.Id), Call("getSensorDeviceName(QString)", x.Id), Call("getSensorKind(QString)", x.Id),
                    Call("getSensorUnits(QString)", x.Id), Call("sensorIsConnected(QString)", x.Id), Call("getSensorValue(QString)", x.Id)).ConfigureAwait(false);
                return (x.Id, x.Type, Parts: parts);
            })).ConfigureAwait(false);
            var now = _time.GetTimestamp();
            lock (gate)
            {
                foreach (var (id, type, p) in details)
                {
                    pendingFetch.Remove(id);
                    var name = (p[0] as string ?? "").Trim();
                    var device = (p[1] as string ?? "").Trim();
                    var kind = (p[2] as string ?? "default").Trim().ToLowerInvariant();
                    var unit = p[3] as string ?? "";
                    var connected = p[4] is true;
                    if (name.Length == 0 || (!connected && string.IsNullOrEmpty(p[5] as string))) { ignored.Add(id); sensors.Remove(id); continue; }
                    if (type == RawSensorType.Temperature)
                    {
                        kind = TemperatureKind(name, device, kind);
                        if (kind == "default") { ignored.Add(id); sensors.Remove(id); continue; }
                    }
                    sensors[id] = new WidgetSensor
                    {
                        NativeId = id, Name = name, Device = device, Type = type, Kind = kind, Unit = unit, Connected = connected,
                        Value = Number(p[5] as string, unit), UpdatedTicks = now,
                    };
                }
            }
        }

        // A device renamed in iCUE may not signal sensorDataChanged: re-read names and devices on the refresh and
        // fetch the sensors that changed (their old id becomes an alias in Snapshot).
        async Task RefreshNamesAsync()
        {
            List<string> known;
            lock (gate) known = [.. sensors.Keys];
            if (known.Count == 0) return;
            var reads = await Task.WhenAll(known.Select(async id =>
                (id, n: await Call("getSensorName(QString)", id).ConfigureAwait(false), d: await Call("getSensorDeviceName(QString)", id).ConfigureAwait(false)))).ConfigureAwait(false);
            var changed = new List<string>();
            lock (gate)
                foreach (var (id, n, d) in reads)
                    if (sensors.TryGetValue(id, out var s) && ((n as string ?? "").Trim() != s.Name || (d as string ?? "").Trim() != s.Device) && pendingFetch.Add(id))
                        changed.Add(id);
            await FetchAsync(changed).ConfigureAwait(false);
        }

        async Task RefreshQuietAsync()
        {
            List<string> quiet;
            lock (gate) quiet = sensors.Values.Where(s => _time.GetElapsedTime(s.UpdatedTicks) > _o.QuietAfter).Select(s => s.NativeId).ToList();
            if (quiet.Count == 0) return;
            var values = await Task.WhenAll(quiet.Select(async id => (id, v: await Call("getSensorValue(QString)", id).ConfigureAwait(false), c: await Call("sensorIsConnected(QString)", id).ConfigureAwait(false)))).ConfigureAwait(false);
            var now = _time.GetTimestamp();
            lock (gate)
                foreach (var (id, v, conn) in values)
                    if (sensors.TryGetValue(id, out var s)) { s.Value = Number(v as string, s.Unit); s.Connected = conn is true; s.UpdatedTicks = now; }
        }

        var all = await Call("getAllSensorIds()").ConfigureAwait(false) as IEnumerable<string?> ?? [];
        var ids = all.OfType<string>().Distinct(StringComparer.Ordinal).ToList();
        lock (gate) foreach (var id in ids) pendingFetch.Add(id);   // signals during the first fetch must not queue a second one
        await FetchAsync(ids).ConfigureAwait(false);
        ConnectedPipe = "widget";
        int count;
        lock (gate) count = sensors.Count;
        SetState(ProviderState.Connected, $"iCUE connected (sensor provider) · {count} cooling sensors", Snapshot(sensors, gate));
        _sessionConnected = true;
        _log.Info($"iCUE: {ids.Count} sensors listed, {count} are cooling sensors.");

        var nextRefresh = _time.GetTimestamp() + (long)(_o.RefreshInterval.TotalSeconds * _time.TimestampFrequency);
        while (!c.Completion.IsCompleted && !sct.IsCancellationRequested)
        {
            Publish(Snapshot(sensors, gate), $"iCUE connected (sensor provider)");
            var waitLeft = TimeSpan.FromSeconds(Math.Max(0, (nextRefresh - _time.GetTimestamp()) / (double)_time.TimestampFrequency));
            using (var iter = CancellationTokenSource.CreateLinkedTokenSource(sct))
            {
                var read = work.Reader.WaitToReadAsync(iter.Token).AsTask();
                var tick = Task.Delay(Min(waitLeft, _o.PollInterval), _time, iter.Token);
                await Task.WhenAny(c.Completion, read, tick).ConfigureAwait(false);
                await iter.CancelAsync().ConfigureAwait(false);
                await Quiet(read).ConfigureAwait(false);
                await Quiet(tick).ConfigureAwait(false);
            }
            if (c.Completion.IsCompleted || sct.IsCancellationRequested) break;

            var fetch = new List<string>();
            while (work.Reader.TryRead(out var item))
            {
                if (item.Remove) lock (gate) { sensors.Remove(item.Id); ignored.Remove(item.Id); }
                else fetch.Add(item.Id);
            }
            if (fetch.Count > 0) await FetchAsync(fetch.Distinct(StringComparer.Ordinal).ToList()).ConfigureAwait(false);

            if (_time.GetTimestamp() >= nextRefresh)
            {
                nextRefresh = _time.GetTimestamp() + (long)(_o.RefreshInterval.TotalSeconds * _time.TimestampFrequency);
                var now = (await Call("getAllSensorIds()").ConfigureAwait(false) as IEnumerable<string?> ?? []).OfType<string>().ToHashSet(StringComparer.Ordinal);
                List<string> added;
                lock (gate)
                {
                    foreach (var gone in sensors.Keys.Where(k => !now.Contains(k)).ToList()) sensors.Remove(gone);
                    added = now.Where(k => !sensors.ContainsKey(k) && !ignored.Contains(k)).ToList();
                }
                await FetchAsync(added).ConfigureAwait(false);
                await RefreshNamesAsync().ConfigureAwait(false);
                await RefreshQuietAsync().ConfigureAwait(false);
            }
        }
        if (ct.IsCancellationRequested) ct.ThrowIfCancellationRequested();
        return SessionEnd.Closed;
    }

    private static async Task Quiet(Task t)
    {
        try { await t.ConfigureAwait(false); } catch (OperationCanceledException) { }
    }

    private static TimeSpan Min(TimeSpan a, TimeSpan b) => a < b ? a : b;

    /// <summary>"package" (CPU), "coolant", "air" (a LINK fan's probe), or "default" (not a cooling sensor: dropped).</summary>
    internal static string TemperatureKind(string name, string device, string kind)
    {
        if (kind == "package") return "package";
        if (CoolantRe().IsMatch(name)) return "coolant";
        var linkish = device.Contains("iCUE LINK", StringComparison.OrdinalIgnoreCase) || name.StartsWith("iCUE LINK", StringComparison.OrdinalIgnoreCase);
        if (linkish && FanProbeRe().IsMatch(name)) return "air";
        return "default";
    }

    private static double? Number(string? text, string? unit)
    {
        var v = SensorClassifier.ParseNumber(text);
        if (v is { } f && SensorClassifier.IsFahrenheit(unit)) return SensorClassifier.ToCelsius(f);
        return v is { } x ? Math.Round(x, 2) : null;
    }

    private IReadOnlyList<RawSensor> Snapshot(Dictionary<string, WidgetSensor> sensors, object gate)
    {
        var list = new List<(RawSensor, string)>();
        var seen = new Dictionary<string, int>(StringComparer.Ordinal);
        var origin = _time.GetUtcNow();
        var nowTicks = _time.GetTimestamp();
        lock (gate)
        {
            foreach (var s in sensors.Values)
            {
                var id = SensorClassifier.IcueId(s.Device, s.Name, s.Type, s.Kind);
                var n = seen[id] = seen.GetValueOrDefault(id) + 1;
                if (n > 1) id += "-" + n;
                list.Add((new RawSensor
                {
                    Id = id, Name = s.Name, Device = s.Device, Type = s.Type, Kind = s.Kind, Value = s.Value, Connected = s.Connected,
                    UpdatedAt = origin - _time.GetElapsedTime(s.UpdatedTicks, nowTicks),
                }, s.NativeId));
            }
        }
        return Stabilize(list, widget: true);
    }

    // ------------------------------------------------------------------ stable ids (across pipes and renames)

    /// <summary>
    /// Applies what the provider has learned so ids survive a pipe switch and a rename in iCUE: on the automation pipe a
    /// sensor matched to a widget sensor takes the widget id; a sensor whose name changed under the same native id keeps
    /// its old id as an alias; widget sensors list their automation ids as aliases. Loop-only.
    /// </summary>
    private List<RawSensor> Stabilize(List<(RawSensor Sensor, string Native)> read, bool widget)
    {
        var keys = read.Select(x => (x.Sensor.Id, Key: MatchKey(x.Sensor))).ToList();
        if (!(widget ? _widgetKeys : _automationKeys).SequenceEqual(keys))
        {
            if (widget) _widgetKeys = keys; else _automationKeys = keys;
            LearnPipeMatches();
        }

        if (_byNative.Count > 4096) _byNative.Clear(); // native ids may be per iCUE session: never grow without bound
        var used = new HashSet<string>(StringComparer.Ordinal);
        var result = new List<RawSensor>(read.Count);
        foreach (var (s, native) in read)
        {
            var id = !widget && _autoToWidget.TryGetValue(s.Id, out var w) && !used.Contains(w) ? w : s.Id;
            used.Add(id);
            var nativeKey = (widget ? "w:" : "a:") + native;
            // Same native sensor, new name or device: renamed in iCUE (an id change alone, e.g. a duplicate's suffix, is not).
            if (_byNative.TryGetValue(nativeKey, out var old) && old.Id != id && (old.Name != s.Name || old.Device != s.Device)) Renamed(old.Id, id);
            _byNative[nativeKey] = (id, s.Name, s.Device);

            var aliases = new List<string>();
            foreach (var (from, to) in _renamedTo) if (to == id) aliases.Add(from);
            if (widget) { foreach (var (a, wid) in _autoToWidget) if (wid == id) aliases.Add(a); }
            else if (id != s.Id) aliases.Add(s.Id);
            result.Add(id == s.Id && aliases.Count == 0 ? s : s with { Id = id, Aliases = [.. aliases.Distinct(StringComparer.Ordinal).Where(a => a != id)] });
        }
        return result;
    }

    private void Renamed(string oldId, string newId)
    {
        _log.Info("iCUE: a sensor was renamed in iCUE; its names, roles and keys follow it.");
        foreach (var k in _renamedTo.Where(kv => kv.Value == oldId).Select(kv => kv.Key).ToList()) _renamedTo[k] = newId;
        _renamedTo.Remove(newId); // renamed back: the id is current again
        _renamedTo[oldId] = newId;
    }

    /// <summary>"device class|name|type|kind": the same sensor on both pipes ("AMD Ryzen 7 9800X3D" and "CPU" are both "cpu").</summary>
    private string MatchKey(RawSensor s)
    {
        if (!_deviceClass.TryGetValue(s.Device, out var cls)) _deviceClass[s.Device] = cls = SensorClassifier.DeviceClass(s.Device);
        return string.Join('|', cls, s.Name.Trim().ToLowerInvariant(), s.Type.ToString(), s.Kind);
    }

    /// <summary>Learns automation id → widget id for sensors that match one to one (ambiguous ones are left alone: a
    /// wrong match would swap two sensors, which is worse than an id change). Matches are kept once learned.</summary>
    private void LearnPipeMatches()
    {
        if (_widgetKeys.Count == 0 || _automationKeys.Count == 0) return;
        static Dictionary<string, string> Unique(List<(string Id, string Key)> keys) =>
            keys.GroupBy(k => k.Key, StringComparer.Ordinal).Where(g => g.Count() == 1).ToDictionary(g => g.Key, g => g.First().Id, StringComparer.Ordinal);
        var w = Unique(_widgetKeys);
        foreach (var (key, autoId) in Unique(_automationKeys))
            if (w.TryGetValue(key, out var widgetId) && widgetId != autoId) _autoToWidget[autoId] = widgetId;
    }

    // ------------------------------------------------------------------ automation SDK session (fallback)

    private async Task<SessionEnd> RunAutomationSessionAsync(QtRoClient c, CancellationToken ct)
    {
        var objects = await c.WaitObjectsAsync(_o.CallTimeout, ct).ConfigureAwait(false);
        var obj = objects.FirstOrDefault(o => o.TypeName == IcueSafety.AutomationType)
            ?? throw new InvalidDataException("the automation pipe has no AutomationSdkIpc object");
        var def = await c.AcquireAsync(obj.Name, _o.CallTimeout, ct).ConfigureAwait(false);
        if (def.MethodIndex("GetSensors()") < 0) throw new KeyNotFoundException("this iCUE version has no GetSensors()");
        using var sessionCts = CancellationTokenSource.CreateLinkedTokenSource(ct);
        c.ObjectRemoved = _ => sessionCts.Cancel();
        var sct = sessionCts.Token;
        var upgradeEvery = Min(_o.RefreshInterval, MaxUpgradeCheck);
        var nextUpgradeCheck = _time.GetTimestamp() + (long)(upgradeEvery.TotalSeconds * _time.TimestampFrequency);
        while (!c.Completion.IsCompleted && !sct.IsCancellationRequested)
        {
            var reply = await c.InvokeAsync(def, obj.Name, "GetSensors()", _o.CallTimeout, sct).ConfigureAwait(false);
            var sensors = Stabilize(ReadAutomation(reply as IEnumerable<object?> ?? [], _time.GetUtcNow()), widget: false);
            if (!_sessionConnected)
            {
                ConnectedPipe = "automation";
                SetState(ProviderState.Connected, $"iCUE connected (automation SDK) · {sensors.Count} cooling sensors", sensors);
                _sessionConnected = true;
            }
            else Publish(sensors, "iCUE connected (automation SDK)");

            // The widget pipe is richer (device names, coolant, push signals): switch as soon as iCUE serves it.
            if (_time.GetTimestamp() >= nextUpgradeCheck)
            {
                nextUpgradeCheck = _time.GetTimestamp() + (long)(upgradeEvery.TotalSeconds * _time.TimestampFrequency);
                if (Candidates().Any(x => x.Widget && Eligible(x.Pipe)))
                {
                    _log.Info("iCUE: the widget sensor pipe is up; switching to it from the automation pipe.");
                    return SessionEnd.Upgrade;
                }
            }

            using var iter = CancellationTokenSource.CreateLinkedTokenSource(sct);
            var tick = Task.Delay(_o.PollInterval, _time, iter.Token);
            await Task.WhenAny(c.Completion, tick).ConfigureAwait(false);
            await iter.CancelAsync().ConfigureAwait(false);
            await Quiet(tick).ConfigureAwait(false);
        }
        if (ct.IsCancellationRequested) ct.ThrowIfCancellationRequested();
        return SessionEnd.Closed;
    }

    /// <summary>Maps AuSdkSensor{id, name, value} gadgets. Ids look like
    /// <c>vid&lt;6940&gt;pid&lt;3135&gt;serial&lt;…&gt;senstype&lt;fan&gt;sensindex&lt;0&gt;sensorSN&lt;…&gt;</c>; serials are never kept.</summary>
    internal static IReadOnlyList<RawSensor> MapAutomation(IEnumerable<object?> gadgets, DateTimeOffset at) =>
        [.. ReadAutomation(gadgets, at).Select(x => x.Sensor)];

    /// <summary><see cref="MapAutomation"/> plus a native key per sensor: a hash of iCUE's hardware id (which contains
    /// serials), used only in memory to notice renames.</summary>
    private static List<(RawSensor Sensor, string Native)> ReadAutomation(IEnumerable<object?> gadgets, DateTimeOffset at)
    {
        var list = new List<(RawSensor, string)>();
        var seen = new Dictionary<string, int>(StringComparer.Ordinal);
        foreach (var g in gadgets.OfType<QGadget>())
        {
            var nativeId = g["id"] as string;
            var name = (g["name"] as string ?? "").Trim();
            var value = g["value"] as string;
            if (string.IsNullOrEmpty(nativeId) || name.Length == 0) continue;
            var parts = PartRe().Matches(nativeId).ToDictionary(m => m.Groups[1].Value.ToLowerInvariant(), m => m.Groups[2].Value, StringComparer.Ordinal);
            var st = parts.GetValueOrDefault("senstype")?.ToLowerInvariant();
            RawSensorType type;
            string kind = "default";
            switch (st)
            {
                case "fan": type = RawSensorType.Fan; break;
                case "pump": type = RawSensorType.Pump; break;
                case "temperaturepackage": type = RawSensorType.Temperature; kind = "package"; break;
                case "temperature":
                    type = RawSensorType.Temperature;
                    kind = TemperatureKind(name, parts.GetValueOrDefault("vid") == "6940" ? LinkHubDevice : "", "default");
                    if (kind == "default") continue;
                    break;
                default: continue;
            }
            var device = AutomationDevice(parts.GetValueOrDefault("vid"), parts.GetValueOrDefault("pid"), parts.GetValueOrDefault("index"));
            var unit = value is null ? "" : UnitRe().Match(value).Value;
            var v = Number(value, unit);
            var id = SensorClassifier.IcueId(device, name, type, kind);
            var n = seen[id] = seen.GetValueOrDefault(id) + 1;
            if (n > 1) id += "-" + n;
            var native = Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(nativeId)), 0, 10);
            list.Add((new RawSensor { Id = id, Name = name, Device = device, Type = type, Kind = kind, Value = v, Connected = v is not null, UpdatedAt = at }, native));
        }
        return list;
    }

    /// <summary>The automation pipe has no device names. LINK devices get the hub's name (so their ids match the widget
    /// pipe's); iCUE's own plugin devices get a generic label from the product id.</summary>
    internal static string AutomationDevice(string? vid, string? pid, string? index)
    {
        if (vid == "6940") return LinkHubDevice;
        var label = pid switch
        {
            "000001" => "Motherboard",
            "000002" => "CPU",
            "000004" or "000006" => "Memory",
            "000007" => "GPU",
            _ => "iCUE device",
        };
        return int.TryParse(index, out var i) && i > 0 ? $"{label} #{i + 1}" : label;
    }

    [GeneratedRegex(@"(\w+)<([^<>]*)>", RegexOptions.CultureInvariant)] private static partial Regex PartRe();
    [GeneratedRegex(@"[^\d\s.,-][^\s]*\s*$", RegexOptions.CultureInvariant)] private static partial Regex UnitRe();
    [GeneratedRegex(@"coolant|liquid|water", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)] private static partial Regex CoolantRe();
    [GeneratedRegex(@":\s*temp(erature)?\s*$", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)] private static partial Regex FanProbeRe();
}
