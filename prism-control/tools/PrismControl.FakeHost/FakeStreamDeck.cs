using System.Collections.Concurrent;
using System.Diagnostics;
using System.Net;
using System.Net.Sockets;
using System.Net.WebSockets;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace PrismControl.FakeHost;

/// <summary>A device the fake app reports in -info.</summary>
public sealed record FakeDevice(string Id, string Name, int Type, int Columns, int Rows)
{
    /// <summary>Corsair Galleon 100 SD: type 12, keys 3 wide × 4 tall, 2 dials × 2 layers (encoder coords 0,0 0,1 1,0 1,1), no touch.</summary>
    public static FakeDevice Galleon(string id = "f00dbabe00000000000000000000gal") => new(id, "Galleon 100 SD", 12, 3, 4);
    /// <summary>Stream Deck +: type 7, 4×2 keys, 4 dials (encoder coords x,0) with touch strip segments.</summary>
    public static FakeDevice Plus(string id = "f00dbabe0000000000000000000plus") => new(id, "Stream Deck +", 7, 4, 2);
    public static FakeDevice StreamDeck(string id = "f00dbabe00000000000000000000sd15") => new(id, "Stream Deck", 0, 5, 3);
}

/// <summary>A message the plugin sent, with its arrival time.</summary>
public sealed record ReceivedMessage(double Ms, string Event, string? Context, JsonObject Raw)
{
    public JsonObject? Payload => Raw["payload"] as JsonObject;
    public bool IsRenderUpdate => Event is "setImage" or "setFeedback" or "setFeedbackLayout" or "setTitle";
}

public sealed record RateReport(int Total, double Seconds, int MaxInAnyOneSecond, double AveragePerSecond);

public sealed record FakeHostOptions
{
    public IReadOnlyList<FakeDevice> Devices { get; init; } = [FakeDevice.Galleon(), FakeDevice.Plus()];
    public string PluginUuid { get; init; } = "com.jeremyfhall.prismcontrol";
    public string PluginVersion { get; init; } = "0.1.0.0";
    public string AppVersion { get; init; } = "7.6.0.23012";
    public JsonObject GlobalSettings { get; init; } = new();
    /// <summary>
    /// Action UUIDs outside <see cref="FakeHostSafety.SafeActions"/> that this run may place. Everything else is refused by
    /// <see cref="FakeStreamDeck.AppearAsync"/>: a real action pressed at random acts on this PC wherever its module does
    /// not honor safe mode.
    /// </summary>
    public IReadOnlyCollection<string> AllowRealActions { get; init; } = [];
}

/// <summary>
/// A fake Stream Deck app: a WebSocket server on 127.0.0.1 that launches the plugin with the real command line
/// shape, answers getSettings/getGlobalSettings like the app, records everything the plugin sends, and lets tests
/// drive willAppear, keys, dials, touch, settings and property-inspector traffic.
/// </summary>
public sealed class FakeStreamDeck : IAsyncDisposable
{
    private readonly TcpListener _listener = new(IPAddress.Loopback, 0);
    private readonly CancellationTokenSource _cts = new();
    private readonly Stopwatch _clock = Stopwatch.StartNew();
    private readonly List<ReceivedMessage> _received = [];
    private readonly object _gate = new();
    private readonly ConcurrentDictionary<string, JsonObject> _settings = new();
    private readonly ConcurrentDictionary<string, (FakeDevice Device, string Action, int Col, int Row, bool Encoder)> _contexts = new();
    private readonly SemaphoreSlim _sendLock = new(1, 1);
    private WebSocket? _socket;
    private TaskCompletionSource _registered = new(TaskCreationOptions.RunContinuationsAsynchronously);
    private int _registrations;
    private Task? _accept;
    private Process? _process;
    private int _contextSeq;

    private FakeStreamDeck(FakeHostOptions options)
    {
        Options = options;
        GlobalSettings = (JsonObject)options.GlobalSettings.DeepClone();
        RegistrationId = Convert.ToHexString(RandomNumberGenerator.GetBytes(16));
    }

    public FakeHostOptions Options { get; }
    public int Port { get; private set; }
    /// <summary>The -pluginUUID (an opaque registration id, as the real app sends).</summary>
    public string RegistrationId { get; }
    public string RegisterEvent => "registerPlugin";
    public JsonObject GlobalSettings { get; private set; }
    public int Registrations => Volatile.Read(ref _registrations);
    public Process? Process => _process;
    public double NowMs => _clock.Elapsed.TotalMilliseconds;
    public bool IsConnected => _socket is { State: WebSocketState.Open };

    public event Action<ReceivedMessage>? MessageReceived;

    public static Task<FakeStreamDeck> StartAsync(FakeHostOptions? options = null)
    {
        var host = new FakeStreamDeck(options ?? new FakeHostOptions());
        host._listener.Start();
        host.Port = ((IPEndPoint)host._listener.LocalEndpoint).Port;
        host._accept = Task.Run(host.AcceptLoopAsync);
        return Task.FromResult(host);
    }

    /// <summary>The -info JSON, shaped like Stream Deck 7.6 on Windows.</summary>
    public string InfoJson()
    {
        var devices = new JsonArray(Options.Devices.Select(d => (JsonNode)new JsonObject
        {
            ["id"] = d.Id,
            ["name"] = d.Name,
            ["size"] = new JsonObject { ["columns"] = d.Columns, ["rows"] = d.Rows },
            ["type"] = d.Type,
        }).ToArray());
        return new JsonObject
        {
            ["application"] = new JsonObject { ["font"] = "Segoe UI", ["language"] = "en", ["platform"] = "windows", ["platformVersion"] = "10.0.26300", ["version"] = Options.AppVersion },
            ["colors"] = new JsonObject
            {
                ["buttonMouseOverBackgroundColor"] = "#464646FF",
                ["buttonPressedBackgroundColor"] = "#303030FF",
                ["buttonPressedBorderColor"] = "#646464FF",
                ["buttonPressedTextColor"] = "#969696FF",
                ["highlightColor"] = "#0078FFFF",
            },
            ["devicePixelRatio"] = 2,
            ["devices"] = devices,
            ["plugin"] = new JsonObject { ["uuid"] = Options.PluginUuid, ["version"] = Options.PluginVersion },
        }.ToJsonString();
    }

    public string[] LaunchArguments() => ["-port", Port.ToString(System.Globalization.CultureInfo.InvariantCulture), "-pluginUUID", RegistrationId, "-registerEvent", RegisterEvent, "-info", InfoJson()];

    /// <summary>
    /// Starts the plugin exe like the app does (working directory = the .sdPlugin root). Always sets
    /// PRISM_CONTROL_SAFE_MODE=1 and PRISM_CONTROL_MACROS_DRY_RUN=1 (<see cref="FakeHostSafety.LaunchVariables"/>), whatever
    /// <paramref name="environment"/> says: the fake host drives fake input, so module writes must be no-ops.
    /// </summary>
    public Process Launch(string exePath, IDictionary<string, string?>? environment = null, string? workingDirectory = null)
    {
        var psi = new ProcessStartInfo(exePath)
        {
            UseShellExecute = false,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            CreateNoWindow = true,
            WorkingDirectory = workingDirectory ?? Path.GetDirectoryName(Path.GetDirectoryName(Path.GetFullPath(exePath))!)!,
        };
        foreach (var a in LaunchArguments()) psi.ArgumentList.Add(a);
        psi.Environment["QT_SCALE_FACTOR"] = "1"; // the real app leaks Qt variables into plugins
        if (environment is not null)
            foreach (var (k, v) in environment) psi.Environment[k] = v;
        foreach (var (k, v) in FakeHostSafety.LaunchVariables) psi.Environment[k] = v; // last: callers cannot turn safety off
        _process = Process.Start(psi) ?? throw new InvalidOperationException("could not start " + exePath);
        _process.OutputDataReceived += (_, _) => { };
        _process.ErrorDataReceived += (_, _) => { };
        _process.BeginOutputReadLine();
        _process.BeginErrorReadLine();
        return _process;
    }

    public async Task<bool> WaitForRegistrationAsync(TimeSpan timeout)
    {
        var t = _registered.Task;
        return await Task.WhenAny(t, Task.Delay(timeout)).ConfigureAwait(false) == t;
    }

    // ------------------------------------------------------------------ driving events

    public string NewContext() => "ctx" + Interlocked.Increment(ref _contextSeq).ToString("D4", System.Globalization.CultureInfo.InvariantCulture) + RegistrationId[..8];

    /// <summary>
    /// willAppear for a key (encoder=false) or an encoder slot. Returns the context. Throws for an action outside
    /// <see cref="FakeHostSafety.SafeActions"/> unless <see cref="FakeHostOptions.AllowRealActions"/> lists it.
    /// </summary>
    public async Task<string> AppearAsync(FakeDevice device, string action, int column, int row, bool encoder = false, JsonObject? settings = null, bool inMultiAction = false, string? context = null)
    {
        if (!FakeHostSafety.IsSafe(action) && !Options.AllowRealActions.Contains(action))
            throw new InvalidOperationException(FakeHostSafety.RefusalMessage(action) + " (FakeHostOptions.AllowRealActions)");
        context ??= NewContext();
        _contexts[context] = (device, action, column, row, encoder);
        _settings[context] = (JsonObject)(settings?.DeepClone() ?? new JsonObject());
        var payload = Payload(context, encoder);
        payload["state"] = 0;
        payload["isInMultiAction"] = inMultiAction;
        await SendEventAsync("willAppear", context, payload).ConfigureAwait(false);
        return context;
    }

    public Task DisappearAsync(string context)
    {
        var payload = Payload(context, _contexts.TryGetValue(context, out var c) && c.Encoder);
        _contexts.TryRemove(context, out _);
        return SendEventAsync("willDisappear", context, payload);
    }

    public Task KeyDownAsync(string context) => SendEventAsync("keyDown", context, KeyPayload(context));
    public Task KeyUpAsync(string context) => SendEventAsync("keyUp", context, KeyPayload(context));

    public async Task PressAsync(string context, int holdMs = 60)
    {
        await KeyDownAsync(context).ConfigureAwait(false);
        await Task.Delay(holdMs).ConfigureAwait(false);
        await KeyUpAsync(context).ConfigureAwait(false);
    }

    public Task DialRotateAsync(string context, int ticks, bool pressed = false)
    {
        var p = Payload(context, true);
        p["ticks"] = ticks;
        p["pressed"] = pressed;
        return SendEventAsync("dialRotate", context, p);
    }

    public Task DialDownAsync(string context) => SendEventAsync("dialDown", context, Payload(context, true));
    public Task DialUpAsync(string context) => SendEventAsync("dialUp", context, Payload(context, true));

    public Task TouchTapAsync(string context, int x, int y, bool hold = false)
    {
        var p = Payload(context, true);
        p["tapPos"] = new JsonArray(x, y);
        p["hold"] = hold;
        return SendEventAsync("touchTap", context, p);
    }

    /// <summary>Simulates the PI changing settings: stores them and sends didReceiveSettings.</summary>
    public Task SettingsFromPropertyInspectorAsync(string context, JsonObject settings)
    {
        _settings[context] = (JsonObject)settings.DeepClone();
        return SendEventAsync("didReceiveSettings", context, Payload(context, _contexts.TryGetValue(context, out var c) && c.Encoder));
    }

    public Task PropertyInspectorDidAppearAsync(string context) => SendActionEventAsync("propertyInspectorDidAppear", context, null);
    public Task PropertyInspectorDidDisappearAsync(string context) => SendActionEventAsync("propertyInspectorDidDisappear", context, null);
    public Task SendToPluginAsync(string context, JsonNode payload) => SendActionEventAsync("sendToPlugin", context, payload);

    public Task GlobalSettingsFromPropertyInspectorAsync(JsonObject settings)
    {
        GlobalSettings = (JsonObject)settings.DeepClone();
        return SendAsync(new JsonObject { ["event"] = "didReceiveGlobalSettings", ["payload"] = new JsonObject { ["settings"] = settings.DeepClone() } });
    }

    public Task DeviceDidConnectAsync(FakeDevice d) => SendAsync(new JsonObject
    {
        ["event"] = "deviceDidConnect",
        ["device"] = d.Id,
        ["deviceInfo"] = new JsonObject { ["name"] = d.Name, ["type"] = d.Type, ["size"] = new JsonObject { ["columns"] = d.Columns, ["rows"] = d.Rows } },
    });

    public JsonObject? StoredSettings(string context) => _settings.TryGetValue(context, out var s) ? (JsonObject)s.DeepClone() : null;

    private JsonObject Payload(string context, bool encoder)
    {
        var c = _contexts.TryGetValue(context, out var v) ? v : default;
        var p = new JsonObject
        {
            ["settings"] = _settings.TryGetValue(context, out var s) ? s.DeepClone() : new JsonObject(),
            ["coordinates"] = new JsonObject { ["column"] = c.Col, ["row"] = c.Row },
            ["controller"] = encoder ? "Encoder" : "Keypad",
        };
        return p;
    }

    private JsonObject KeyPayload(string context)
    {
        var p = Payload(context, false);
        p.Remove("controller");
        p["state"] = 0;
        p["isInMultiAction"] = false;
        return p;
    }

    private Task SendEventAsync(string evt, string context, JsonObject payload)
    {
        var c = _contexts.TryGetValue(context, out var v) ? v : default;
        return SendAsync(new JsonObject
        {
            ["action"] = c.Action,
            ["event"] = evt,
            ["context"] = context,
            ["device"] = c.Device?.Id,
            ["payload"] = payload,
        });
    }

    private Task SendActionEventAsync(string evt, string context, JsonNode? payload)
    {
        var c = _contexts.TryGetValue(context, out var v) ? v : default;
        var o = new JsonObject { ["action"] = c.Action, ["event"] = evt, ["context"] = context, ["device"] = c.Device?.Id };
        if (payload is not null) o["payload"] = payload.DeepClone();
        return SendAsync(o);
    }

    public async Task SendAsync(JsonObject message)
    {
        var ws = _socket ?? throw new InvalidOperationException("The plugin is not connected.");
        var bytes = Encoding.UTF8.GetBytes(message.ToJsonString());
        await _sendLock.WaitAsync().ConfigureAwait(false);
        try { await ws.SendAsync(bytes, WebSocketMessageType.Text, true, _cts.Token).ConfigureAwait(false); }
        finally { _sendLock.Release(); }
    }

    // ------------------------------------------------------------------ observing

    public IReadOnlyList<ReceivedMessage> Received
    {
        get { lock (_gate) return [.. _received]; }
    }

    public IReadOnlyList<ReceivedMessage> ReceivedFor(string context, string? evt = null) =>
        Received.Where(m => m.Context == context && (evt is null || m.Event == evt)).ToList();

    public void ClearReceived()
    {
        lock (_gate) _received.Clear();
    }

    public async Task<ReceivedMessage> WaitForAsync(Func<ReceivedMessage, bool> predicate, TimeSpan timeout, double sinceMs = 0)
    {
        var deadline = Stopwatch.StartNew();
        while (deadline.Elapsed < timeout)
        {
            var hit = Received.FirstOrDefault(m => m.Ms >= sinceMs && predicate(m));
            if (hit is not null) return hit;
            await Task.Delay(10).ConfigureAwait(false);
        }
        throw new TimeoutException("No matching message from the plugin within " + timeout.TotalSeconds + " s.");
    }

    /// <summary>Render updates (setImage/setFeedback/setFeedbackLayout/setTitle) between two times: total and worst 1-second window.</summary>
    public RateReport RenderRate(double fromMs, double toMs, Func<ReceivedMessage, bool>? filter = null)
    {
        var times = Received.Where(m => m.IsRenderUpdate && m.Ms >= fromMs && m.Ms <= toMs && (filter?.Invoke(m) ?? true)).Select(m => m.Ms).OrderBy(x => x).ToList();
        var max = 0;
        var j = 0;
        for (var i = 0; i < times.Count; i++)
        {
            while (times[i] - times[j] >= 1000) j++;
            max = Math.Max(max, i - j + 1);
        }
        var seconds = Math.Max(0.001, (toMs - fromMs) / 1000);
        return new RateReport(times.Count, seconds, max, times.Count / seconds);
    }

    // ------------------------------------------------------------------ connection control

    /// <summary>Drops the TCP connection without a close frame (the plugin should reconnect and re-register).</summary>
    public void AbortConnection()
    {
        var ws = _socket;
        _socket = null;
        _registered = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        ws?.Abort();
    }

    /// <summary>Closes like the app does when it stops a plugin (the plugin should exit).</summary>
    public async Task CloseNormallyAsync()
    {
        var ws = _socket;
        if (ws is null) return;
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(3));
        try { await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, "app stopping plugin", timeout.Token).ConfigureAwait(false); }
        catch { ws.Abort(); }
    }

    public async Task<bool> WaitForExitAsync(TimeSpan timeout)
    {
        if (_process is null) return true;
        try
        {
            await _process.WaitForExitAsync(new CancellationTokenSource(timeout).Token).ConfigureAwait(false);
            return true;
        }
        catch (OperationCanceledException) { return false; }
    }

    private async Task AcceptLoopAsync()
    {
        while (!_cts.IsCancellationRequested)
        {
            TcpClient client;
            try { client = await _listener.AcceptTcpClientAsync(_cts.Token).ConfigureAwait(false); }
            catch { break; }
            _ = Task.Run(() => ServeAsync(client));
        }
    }

    private async Task ServeAsync(TcpClient client)
    {
        using (client)
        {
            var stream = client.GetStream();
            if (!await HandshakeAsync(stream).ConfigureAwait(false)) return;
            using var ws = WebSocket.CreateFromStream(stream, new WebSocketCreationOptions { IsServer = true, KeepAliveInterval = TimeSpan.Zero });
            _socket = ws;
            var buffer = new byte[1 << 16];
            var message = new MemoryStream();
            try
            {
                while (ws.State == WebSocketState.Open && !_cts.IsCancellationRequested)
                {
                    var r = await ws.ReceiveAsync(buffer, _cts.Token).ConfigureAwait(false);
                    if (r.MessageType == WebSocketMessageType.Close)
                    {
                        try { await ws.CloseOutputAsync(WebSocketCloseStatus.NormalClosure, "", CancellationToken.None).ConfigureAwait(false); } catch { }
                        break;
                    }
                    message.Write(buffer, 0, r.Count);
                    if (!r.EndOfMessage) continue;
                    var text = Encoding.UTF8.GetString(message.GetBuffer(), 0, (int)message.Length);
                    message.SetLength(0);
                    await OnTextAsync(text).ConfigureAwait(false);
                }
            }
            catch (Exception ex) when (ex is WebSocketException or OperationCanceledException or IOException or ObjectDisposedException) { }
            if (ReferenceEquals(_socket, ws)) _socket = null;
        }
    }

    private async Task OnTextAsync(string text)
    {
        JsonObject? o;
        try { o = JsonNode.Parse(text) as JsonObject; } catch (JsonException) { return; }
        if (o is null) return;
        var evt = o["event"]?.GetValue<string>() ?? "";
        var context = o["context"] is JsonValue cv && cv.TryGetValue<string>(out var c) ? c : null;
        if (evt == RegisterEvent && o["uuid"]?.GetValue<string>() == RegistrationId)
        {
            Interlocked.Increment(ref _registrations);
            _registered.TrySetResult();
        }
        var rec = new ReceivedMessage(NowMs, evt, context, o);
        lock (_gate) _received.Add(rec);
        try { MessageReceived?.Invoke(rec); } catch { }

        // Behave like the app for request/response commands.
        switch (evt)
        {
            case "setSettings" when context is not null && o["payload"] is JsonObject s:
                _settings[context] = (JsonObject)s.DeepClone();
                break;
            case "getSettings" when context is not null:
                await SendEventAsync("didReceiveSettings", context, Payload(context, _contexts.TryGetValue(context, out var cc) && cc.Encoder)).ConfigureAwait(false);
                break;
            case "setGlobalSettings" when o["payload"] is JsonObject g:
                GlobalSettings = (JsonObject)g.DeepClone();
                break;
            case "getGlobalSettings":
                await SendAsync(new JsonObject { ["event"] = "didReceiveGlobalSettings", ["payload"] = new JsonObject { ["settings"] = GlobalSettings.DeepClone() } }).ConfigureAwait(false);
                break;
        }
    }

    private static async Task<bool> HandshakeAsync(NetworkStream stream)
    {
        var buf = new byte[8192];
        var len = 0;
        while (true)
        {
            var n = await stream.ReadAsync(buf.AsMemory(len)).ConfigureAwait(false);
            if (n == 0) return false;
            len += n;
            var s = Encoding.ASCII.GetString(buf, 0, len);
            var end = s.IndexOf("\r\n\r\n", StringComparison.Ordinal);
            if (end < 0) { if (len == buf.Length) return false; continue; }
            var key = s.Split("\r\n").Select(l => l.Split(':', 2)).Where(p => p.Length == 2 && p[0].Trim().Equals("Sec-WebSocket-Key", StringComparison.OrdinalIgnoreCase))
                .Select(p => p[1].Trim()).FirstOrDefault();
            if (key is null) return false;
            var accept = Convert.ToBase64String(SHA1.HashData(Encoding.ASCII.GetBytes(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11")));
            var resp = $"HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: {accept}\r\n\r\n";
            await stream.WriteAsync(Encoding.ASCII.GetBytes(resp)).ConfigureAwait(false);
            return true;
        }
    }

    /// <summary>Stops the server and kills the plugin process tree if it is still running.</summary>
    public async ValueTask DisposeAsync()
    {
        _cts.Cancel();
        try { _listener.Stop(); } catch { }
        try { _socket?.Abort(); } catch { }
        if (_process is { } p)
        {
            try
            {
                if (!p.HasExited)
                {
                    p.Kill(entireProcessTree: true);
                    await p.WaitForExitAsync(new CancellationTokenSource(TimeSpan.FromSeconds(5)).Token).ConfigureAwait(false);
                }
            }
            catch { }
            p.Dispose();
        }
        if (_accept is not null) { try { await _accept.ConfigureAwait(false); } catch { } }
        _cts.Dispose();
    }
}
