using System.Buffers.Binary;
using System.Collections.Concurrent;
using System.IO.Pipes;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using PrismControl.Core.Data;
using PrismControl.Core.Devices;
using PrismControl.Core.Hosting;
using PrismControl.Cooling.Icue;
using PrismControl.Cooling.Icue.QtRo;
using PrismControl.Testing;

namespace PrismControl.Cooling.Tests;

/// <summary>Recorded, sanitized fixtures (see Fixtures/*.json: no serials, GUIDs or machine names).</summary>
public static class Fixtures
{
    public static string Path(string name) => System.IO.Path.Combine(AppContext.BaseDirectory, "Fixtures", name);
    public static byte[] Definition(string kind) => Convert.FromBase64String(File.ReadAllText(Path(kind + "-definition.b64")).Trim());
    public static JsonArray Sensors(string kind) => (JsonArray)JsonNode.Parse(File.ReadAllText(Path(kind + "-sensors.json")))!["sensors"]!;
    public static byte[] LhmData() => File.ReadAllBytes(Path("lhm-data.json"));
}

/// <summary>A provider whose readings the test sets directly.</summary>
public sealed class FakeProvider(string name) : ICoolingProvider
{
    public string Name { get; } = name;
    public ProviderReading Current { get; set; } = ProviderReading.Off;
    public bool Wanted { get; set; }
    public int Starts { get; private set; }
    public int Stops { get; private set; }
    public bool Running { get; private set; }

    public void Start()
    {
        if (Running) return;
        Running = true;
        Starts++;
    }

    public Task StopAsync()
    {
        if (Running) Stops++;
        Running = false;
        return Task.CompletedTask;
    }

    public ValueTask DisposeAsync() => ValueTask.CompletedTask;

    public void Set(ProviderState state, params RawSensor[] sensors) => Current = new ProviderReading(state, state.ToString(), sensors);
}

/// <summary>Realistic iCUE-like readings for service and action tests (fictional ids).</summary>
public static class Sample
{
    public static RawSensor Fan(string name, double rpm, string device = IcueProvider.LinkHubDevice) =>
        new() { Id = SensorClassifier.IcueId(device, name, RawSensorType.Fan, "default"), Name = name, Device = device, Type = RawSensorType.Fan, Value = rpm };

    public static RawSensor Pump(double rpm) => new()
    {
        Id = SensorClassifier.IcueId(IcueProvider.LinkHubDevice, "iCUE LINK TITAN 360 LCD: Pump", RawSensorType.Pump, "default"),
        Name = "iCUE LINK TITAN 360 LCD: Pump", Device = IcueProvider.LinkHubDevice, Type = RawSensorType.Pump, Value = rpm,
    };

    public static RawSensor Coolant(double c) => new()
    {
        Id = SensorClassifier.IcueId(IcueProvider.LinkHubDevice, "iCUE LINK TITAN 360 LCD: Coolant Temp", RawSensorType.Temperature, "coolant"),
        Name = "iCUE LINK TITAN 360 LCD: Coolant Temp", Device = IcueProvider.LinkHubDevice, Type = RawSensorType.Temperature, Kind = "coolant", Value = c,
    };

    public static RawSensor Cpu(double c, string id = "icue-cpu0000000") => new()
    {
        Id = id, Name = "Package", Device = "Example CPU 8-Core", Type = RawSensorType.Temperature, Kind = "package", Value = c,
    };

    /// <summary>The dev PC's layout: 6 RX + 4 QX LINK fans, a TITAN 360 pump, coolant, CPU package, a GPU fan.</summary>
    public static RawSensor[] Icue(double phase = 0)
    {
        var w = Math.Sin(phase);
        var list = new List<RawSensor>();
        for (var i = 1; i <= 6; i++) list.Add(Fan($"iCUE LINK RX RGB #{i}: Fan", Math.Round(1450 + i * 2 + 120 * w)));
        for (var i = 1; i <= 4; i++) list.Add(Fan($"iCUE LINK QX RGB #{i}: Fan", Math.Round(1730 + i * 3 + 60 * w)));
        list.Add(Pump(Math.Round(2380 + 60 * w)));
        list.Add(Coolant(Math.Round(39.5 + 1.5 * w, 2)));
        list.Add(Cpu(Math.Round(61 + 9 * Math.Sin(phase + 0.6), 2)));
        list.Add(Fan("Fan #1", 1684, "NVIDIA GeForce Example GPU"));
        return [.. list];
    }

    /// <summary>A service over fake providers with a manual clock (no background loop).</summary>
    public static (CoolingService Service, FakeProvider Icue, FakeProvider Lhm, ManualTimeProvider Time, TestGlobalSettings Globals) Service()
    {
        var icue = new FakeProvider(IcueProvider.ProviderName);
        var lhm = new FakeProvider(Lhm.LhmProvider.ProviderName);
        var time = new ManualTimeProvider();
        var globals = new TestGlobalSettings();
        var svc = new CoolingService([icue, lhm], globals, time, NullLog.Instance, new CoolingServiceOptions { AutoSample = false });
        return (svc, icue, lhm, time, globals);
    }

    /// <summary>Feeds <paramref name="seconds"/> of 1 Hz samples with gently moving values.</summary>
    public static void Feed(CoolingService svc, FakeProvider icue, ManualTimeProvider time, int seconds, double phase0 = 0)
    {
        for (var i = 0; i < seconds; i++)
        {
            icue.Set(ProviderState.Connected, Icue(phase0 + i / 25.0));
            svc.SampleNow();
            time.Advance(TimeSpan.FromSeconds(1));
        }
    }
}

/// <summary>
/// A fake iCUE: a real named-pipe QtRO 2.0 server that replays the RECORDED class definition and answers invokes from
/// sanitized fixtures. It records every packet a client sends, so tests can prove the client only ever sent
/// AddObject and allowlisted getters.
/// </summary>
internal sealed class FakeQtRoServer : IAsyncDisposable
{
    private readonly string _objectName;
    private readonly string _typeName;
    private readonly byte[] _definition;
    private readonly QClassDef _def;
    private readonly Func<string, IReadOnlyList<string?>, Action<QWriter>?> _handler;
    private readonly CancellationTokenSource _cts = new();
    private readonly SemaphoreSlim _write = new(1, 1);
    private readonly Task _accept;
    private NamedPipeServerStream? _current;
    private TaskCompletionSource _connected = new(TaskCreationOptions.RunContinuationsAsynchronously);

    public FakeQtRoServer(string objectName, string typeName, byte[] definition, Func<string, IReadOnlyList<string?>, Action<QWriter>?> handler, string? pipeName = null)
    {
        PipeName = pipeName ?? "PrismControlCoolingTest_" + Environment.ProcessId + "_" + Interlocked.Increment(ref _n);
        _objectName = objectName;
        _typeName = typeName;
        _definition = definition;
        _def = new QVariantDecoder().ParseDefinition(new QReader(definition, bigEndian: false));
        _handler = handler;
        _accept = Task.Run(AcceptLoopAsync);
    }

    private static int _n;

    public string PipeName { get; }
    public QClassDef Definition => _def;
    public ConcurrentQueue<(QtRoPacketType Type, string? Signature)> Received { get; } = new();
    public int Connections => Volatile.Read(ref _connections);
    private int _connections;
    /// <summary>The impersonation level the last client granted (read after its first packet, as a squatter could).</summary>
    public System.Security.Principal.TokenImpersonationLevel? ClientImpersonation { get; private set; }
    /// <summary>While false, the pipe does not exist (iCUE "not running").</summary>
    public bool Accepting { get; set; } = true;

    public Task WaitConnectedAsync(TimeSpan timeout) => _connected.Task.WaitAsync(timeout);

    private async Task AcceptLoopAsync()
    {
        var ct = _cts.Token;
        while (!ct.IsCancellationRequested)
        {
            if (!Accepting) { await Task.Delay(20, ct).ConfigureAwait(false); continue; }
            var server = new NamedPipeServerStream(PipeName, PipeDirection.InOut, 1, PipeTransmissionMode.Byte, PipeOptions.Asynchronous);
            try
            {
                await server.WaitForConnectionAsync(ct).ConfigureAwait(false);
                _current = server;
                Interlocked.Increment(ref _connections);
                await SendAsync(QtRoPacket.Build(QtRoPacketType.Handshake, w => w.QString("QtRO 2.0")), ct).ConfigureAwait(false);
                await SendAsync(QtRoPacket.Build(QtRoPacketType.ObjectList, w => w.U32(1).QString(_objectName).QString(_typeName).QBytes("0000000000000000000000000000000000000000")), ct).ConfigureAwait(false);
                _connected.TrySetResult();
                await SessionAsync(server, ct).ConfigureAwait(false);
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested) { }
            catch (IOException) { }
            catch (ObjectDisposedException) { }
            finally
            {
                _current = null;
                await server.DisposeAsync().ConfigureAwait(false);
                _connected = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
            }
        }
    }

    private async Task SessionAsync(NamedPipeServerStream s, CancellationToken ct)
    {
        var header = new byte[4];
        var first = true;
        while (!ct.IsCancellationRequested && s.IsConnected)
        {
            await s.ReadExactlyAsync(header, ct).ConfigureAwait(false);
            var body = new byte[BinaryPrimitives.ReadUInt32LittleEndian(header)];
            await s.ReadExactlyAsync(body, ct).ConfigureAwait(false);
            if (first)
            {
                first = false;
                ClientImpersonation = ImpersonationOf(s);
            }
            var r = new QReader(body, bigEndian: false);
            var type = (QtRoPacketType)r.U16();
            switch (type)
            {
                case QtRoPacketType.AddObject:
                    Received.Enqueue((type, null));
                    var name = r.QString();
                    await SendAsync(QtRoPacket.Build(QtRoPacketType.InitDynamicPacket, w => w.QString(name).Raw(_definition)), ct).ConfigureAwait(false);
                    break;
                case QtRoPacketType.InvokePacket:
                {
                    var obj = r.QString();
                    r.S32();
                    var index = r.S32();
                    var argc = r.U32();
                    var args = new List<string?>();
                    for (var i = 0; i < argc; i++) { r.U32(); r.S8(); args.Add(r.QString()); }
                    var serial = r.S32();
                    var sig = index >= 0 && index < _def.Methods.Count ? _def.Methods[index].Signature : "#" + index;
                    Received.Enqueue((type, sig));
                    var reply = _handler(sig, args);
                    await SendAsync(QtRoPacket.Build(QtRoPacketType.InvokeReplyPacket, w =>
                    {
                        w.QString(obj).S32(serial);
                        if (reply is null) w.U32(0).S8(1); else reply(w);
                    }), ct).ConfigureAwait(false);
                    break;
                }
                default:
                    Received.Enqueue((type, null));
                    break;
            }
        }
    }

    static FakeQtRoServer() { using var self = System.Security.Principal.WindowsIdentity.GetCurrent(); } // load the type before impersonating

    /// <summary>What a malicious server could do with this client's token: impersonate it at this level.</summary>
    private static System.Security.Principal.TokenImpersonationLevel? ImpersonationOf(NamedPipeServerStream s)
    {
        System.Security.Principal.TokenImpersonationLevel? level = null;
        try
        {
            s.RunAsClient(() =>
            {
                using var id = System.Security.Principal.WindowsIdentity.GetCurrent(System.Security.Principal.TokenAccessLevels.Query);
                level = id.ImpersonationLevel;
            });
        }
        catch (IOException) { level = System.Security.Principal.TokenImpersonationLevel.Anonymous; }
        return level;
    }

    private async Task SendAsync(byte[] packet, CancellationToken ct)
    {
        var s = _current ?? throw new IOException("no client");
        await _write.WaitAsync(ct).ConfigureAwait(false);
        try
        {
            await s.WriteAsync(packet, ct).ConfigureAwait(false);
            await s.FlushAsync(ct).ConfigureAwait(false);
        }
        finally { _write.Release(); }
    }

    /// <summary>Pushes a signal (server → client InvokePacket) with QString arguments.</summary>
    public Task SignalAsync(string signature, params string[] args)
    {
        var index = _def.SignalIndex(signature);
        if (index < 0) throw new ArgumentException("no signal " + signature);
        return SendAsync(QtRoPacket.Build(QtRoPacketType.InvokePacket, w =>
        {
            w.QString(_objectName).S32(0).S32(index).U32((uint)args.Length);
            foreach (var a in args) w.VariantString(a);
            w.S32(-1).S32(-1);
        }), _cts.Token);
    }

    /// <summary>Simulates iCUE exiting: closes the client's connection (and, with <paramref name="stayDown"/>, the pipe).</summary>
    public async Task DropClientAsync(bool stayDown = false)
    {
        if (stayDown) Accepting = false;
        if (_current is { } c) await c.DisposeAsync().ConfigureAwait(false);
    }

    /// <summary>Every signature the client invoked.</summary>
    public IReadOnlyList<string> Invoked => [.. Received.Where(p => p.Type == QtRoPacketType.InvokePacket).Select(p => p.Signature!)];

    public async ValueTask DisposeAsync()
    {
        await _cts.CancelAsync().ConfigureAwait(false);
        if (_current is { } c) await c.DisposeAsync().ConfigureAwait(false);
        try { await _accept.ConfigureAwait(false); } catch (OperationCanceledException) { }
        _cts.Dispose();
    }

    // ------------------------------------------------------------------ fixture-backed servers

    /// <summary>A fake SensorProvider (widget pipe) backed by widget-sensors.json. <paramref name="values"/> lets tests change values.</summary>
    /// <param name="names">Overrides sensor names by fixture id (simulates a rename in iCUE).</param>
    public static FakeQtRoServer Widget(ConcurrentDictionary<string, string>? values = null, ConcurrentDictionary<string, string>? names = null, string? pipeName = null)
    {
        var sensors = Fixtures.Sensors("widget").Select(n => n!.AsObject()).ToDictionary(o => o["id"]!.GetValue<string>());
        values ??= new ConcurrentDictionary<string, string>(sensors.ToDictionary(kv => kv.Key, kv => kv.Value["value"]!.GetValue<string>()));
        names ??= new ConcurrentDictionary<string, string>();
        return new FakeQtRoServer("SensorProvider", "SensorProvider", Fixtures.Definition("widget"), (sig, args) =>
        {
            var id = args.Count > 0 ? args[0] ?? "" : "";
            sensors.TryGetValue(id, out var s);
            string Field(string f) => f == "name" && names.TryGetValue(id, out var renamed) ? renamed : s?[f]?.GetValue<string>() ?? "";
            return sig switch
            {
                "getAllSensorIds()" => w => w.VariantStringList([.. sensors.Keys]),
                "getSensorValue(QString)" => w => w.VariantString(values.TryGetValue(id, out var v) ? v : ""),
                "getSensorUnits(QString)" => w => w.VariantString(Field("units")),
                "getSensorName(QString)" => w => w.VariantString(s is null ? null : Field("name")),
                "getSensorDeviceName(QString)" => w => w.VariantString(s is null ? null : Field("device")),
                "getSensorType(QString)" => w => w.VariantString(s is null ? null : Field("type")),
                "getSensorKind(QString)" => w => w.VariantString(s is null ? null : Field("kind")),
                "sensorIsConnected(QString)" => w => w.VariantBool(s?["connected"]?.GetValue<bool>() == true),
                _ => null,
            };
        }, pipeName);
    }

    /// <summary>A fake AutomationSdkIpc backed by automation-sensors.json (GetSensors returns a QVector&lt;AuSdkSensor&gt;).</summary>
    public static FakeQtRoServer Automation(string? pipeName = null)
    {
        var sensors = Fixtures.Sensors("automation").Select(n => n!.AsObject()).ToList();
        return new FakeQtRoServer("AutomationSdkIpc", "AutomationSdkIpc", Fixtures.Definition("automation"), (sig, args) => sig switch
        {
            "GetSensors()" => w => WriteSensorVector(w, sensors.Select(s => (s["id"]!.GetValue<string>(), s["name"]!.GetValue<string>(), s["value"]!.GetValue<string>()))),
            _ => null,
        }, pipeName);
    }

    /// <summary>QVariant(user "QRemoteObjectPackets::QSQ_") holding QVector&lt;AuSdkSensor&gt;; the values are a nested big-endian stream.</summary>
    public static void WriteSensorVector(QWriter w, IEnumerable<(string Id, string Name, string Value)> items)
    {
        var list = items.ToList();
        var inner = new QWriter(bigEndian: true).QBytes("AuSdkSensor").U32((uint)list.Count);
        foreach (var (id, name, value) in list) inner.VariantString(id).VariantString(name).VariantString(value);
        w.U32(QMetaTypeId.User).S8(0).QBytes("QRemoteObjectPackets::QSQ_").QBytes("QVector<AuSdkSensor>").QBytes("AuSdkSensor").QByteArray(inner.ToArray());
    }
}

/// <summary>A one-endpoint HTTP/1.1 server on 127.0.0.1:0 that serves the LHM fixture (or 404s), counting requests.</summary>
public sealed class FakeLhmServer : IAsyncDisposable
{
    private readonly TcpListener _listener = new(IPAddress.Loopback, 0);
    private readonly CancellationTokenSource _cts = new();
    private readonly Task _loop;

    public FakeLhmServer(byte[] body)
    {
        Body = body;
        _listener.Start();
        Port = ((IPEndPoint)_listener.LocalEndpoint).Port;
        _loop = Task.Run(LoopAsync);
    }

    public int Port { get; }
    public byte[] Body { get; set; }
    public int Requests => Volatile.Read(ref _requests);
    private int _requests;

    private async Task LoopAsync()
    {
        while (!_cts.IsCancellationRequested)
        {
            TcpClient c;
            try { c = await _listener.AcceptTcpClientAsync(_cts.Token).ConfigureAwait(false); }
            catch (Exception) { return; }
            _ = Task.Run(async () =>
            {
                using (c)
                {
                    var s = c.GetStream();
                    var buf = new byte[4096];
                    var req = new StringBuilder();
                    try
                    {
                        while (!req.ToString().Contains("\r\n\r\n", StringComparison.Ordinal))
                        {
                            var n = await s.ReadAsync(buf, _cts.Token).ConfigureAwait(false);
                            if (n == 0) return;
                            req.Append(Encoding.ASCII.GetString(buf, 0, n));
                        }
                        Interlocked.Increment(ref _requests);
                        var ok = req.ToString().StartsWith("GET /data.json", StringComparison.Ordinal);
                        var body = ok ? Body : Encoding.ASCII.GetBytes("not found");
                        var head = $"HTTP/1.1 {(ok ? "200 OK" : "404 Not Found")}\r\nContent-Type: application/json\r\nContent-Length: {body.Length}\r\nConnection: close\r\n\r\n";
                        await s.WriteAsync(Encoding.ASCII.GetBytes(head), _cts.Token).ConfigureAwait(false);
                        await s.WriteAsync(body, _cts.Token).ConfigureAwait(false);
                    }
                    catch (Exception) { }
                }
            });
        }
    }

    public async ValueTask DisposeAsync()
    {
        await _cts.CancelAsync().ConfigureAwait(false);
        _listener.Stop();
        try { await _loop.ConfigureAwait(false); } catch { }
        _cts.Dispose();
    }
}

/// <summary>A minimal module context (real DataRegistry and ServiceRegistry).</summary>
public sealed class TestModuleContext(IGlobalSettings? globalSettings = null) : IModuleContext, IDisposable
{
    private readonly CancellationTokenSource _cts = new();

    public ILog Log { get; } = NullLog.Instance;
    public IDataRegistry Data { get; } = new DataRegistry();
    public IServiceRegistry Services { get; } = new ServiceRegistry();
    public IGlobalSettings GlobalSettings { get; } = globalSettings ?? new TestGlobalSettings();
    public IPluginEvents Events { get; } = new NoEvents();
    public IDeviceDirectory Devices { get; } = new NoDevices();
    public TimeProvider Time { get; } = TimeProvider.System;
    public CancellationToken ShutdownToken => _cts.Token;
    public string PluginDirectory => AppContext.BaseDirectory;
    public string DataDirectory => System.IO.Path.Combine(System.IO.Path.GetTempPath(), "prismcontrol-cooling-tests");
    public void OpenUrl(string url) { }
    public void Dispose() { _cts.Cancel(); _cts.Dispose(); }

    private sealed class NoEvents : IPluginEvents
    {
#pragma warning disable CS0067 // never raised in tests
        public event EventHandler<DeviceInfo>? DeviceConnected;
        public event EventHandler<string>? DeviceDisconnected;
        public event EventHandler? SystemWokeUp;
        public event EventHandler<string>? ApplicationLaunched;
        public event EventHandler<string>? ApplicationTerminated;
        public event EventHandler<string>? DeepLinkReceived;
        public event EventHandler? Connected;
        public event EventHandler? Disconnected;
#pragma warning restore CS0067
    }

    private sealed class NoDevices : IDeviceDirectory
    {
        public IReadOnlyCollection<DeviceInfo> All => [];
        public DeviceInfo? Find(string deviceId) => null;
    }
}

public static class TestUtil
{
    /// <summary>Polls until <paramref name="condition"/> holds (real time; for the pipe/HTTP tests).</summary>
    public static async Task Until(Func<bool> condition, TimeSpan timeout, string what)
    {
        var deadline = DateTime.UtcNow + timeout;
        while (!condition())
        {
            if (DateTime.UtcNow > deadline) throw new AssertException("timed out waiting for " + what);
            await Task.Delay(20);
        }
    }

    public static string Json(object o) => JsonSerializer.Serialize(o);
}

/// <summary>A pipe squatter: accepts every connection on a widget-looking name and never says a word.</summary>
internal sealed class SilentPipeServer : IAsyncDisposable
{
    private readonly CancellationTokenSource _cts = new();
    private readonly Task _loop;

    public SilentPipeServer(string pipeName)
    {
        PipeName = pipeName;
        _loop = Task.Run(async () =>
        {
            var held = new List<NamedPipeServerStream>();
            try
            {
                while (!_cts.IsCancellationRequested)
                {
                    var s = new NamedPipeServerStream(pipeName, PipeDirection.InOut, NamedPipeServerStream.MaxAllowedServerInstances, PipeTransmissionMode.Byte, PipeOptions.Asynchronous);
                    held.Add(s);
                    await s.WaitForConnectionAsync(_cts.Token).ConfigureAwait(false);
                    Interlocked.Increment(ref _connections);
                }
            }
            catch (OperationCanceledException) { }
            catch (IOException) { }
            finally { foreach (var s in held) await s.DisposeAsync().ConfigureAwait(false); }
        });
    }

    public string PipeName { get; }
    public int Connections => Volatile.Read(ref _connections);
    private int _connections;

    public async ValueTask DisposeAsync()
    {
        await _cts.CancelAsync().ConfigureAwait(false);
        try { await _loop.ConfigureAwait(false); } catch (OperationCanceledException) { }
        _cts.Dispose();
    }
}

/// <summary>Global settings that count their Changed subscribers (proves modules unsubscribe on dispose).</summary>
public sealed class CountingGlobalSettings : IGlobalSettings
{
    private readonly TestGlobalSettings _inner = new();
    private EventHandler<GlobalSettingsChangedEventArgs>? _changed;

    public int Subscribers => _changed?.GetInvocationList().Length ?? 0;
    public bool IsLoaded => _inner.IsLoaded;
    public Task WaitForLoadAsync(TimeSpan timeout) => _inner.WaitForLoadAsync(timeout);
    public JsonObject Snapshot() => _inner.Snapshot();
    public T GetSection<T>(string section) where T : class, new() => _inner.GetSection<T>(section);
    public void SetSection<T>(string section, T value) where T : class => _inner.SetSection(section, value);
    public CoreSettings Core => _inner.Core;

    public event EventHandler<GlobalSettingsChangedEventArgs>? Changed
    {
        add => _changed += value;
        remove => _changed -= value;
    }
}
