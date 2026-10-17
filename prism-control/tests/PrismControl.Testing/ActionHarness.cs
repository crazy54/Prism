using System.Text.Json;
using System.Text.Json.Nodes;
using PrismControl.Core.Actions;
using PrismControl.Core.Devices;
using PrismControl.Core.Hosting;
using PrismControl.Core.Render;
using PrismControl.Core.Scheduling;

namespace PrismControl.Testing;

/// <summary>Ready-made devices with the real types and grids.</summary>
public static class TestDevices
{
    public static readonly DeviceInfo Galleon = new("dev-galleon", "Galleon 100 SD", DeviceType.Galleon100SD, 3, 4);
    public static readonly DeviceInfo Plus = new("dev-plus", "Stream Deck +", DeviceType.Plus, 4, 2);
    public static readonly DeviceInfo StreamDeck = new("dev-sd", "Stream Deck", DeviceType.StreamDeck, 5, 3);
    public static readonly DeviceInfo Mini = new("dev-mini", "Stream Deck Mini", DeviceType.Mini, 3, 2);
    public static readonly DeviceInfo XL = new("dev-xl", "Stream Deck XL", DeviceType.XL, 8, 4);
}

/// <summary>One call an action made on its channel.</summary>
public sealed record ChannelCall(string Kind, string Context, JsonNode? Payload, UpdatePriority? Priority = null)
{
    public string? Image => Kind == "setImage" ? Payload?["image"]?.GetValue<string>() : null;
}

/// <summary>Records every command (no scheduling, no coalescing: tests see every frame the action produced).</summary>
public sealed class RecordingChannel : IActionChannel
{
    private readonly List<ChannelCall> _calls = [];
    public readonly List<string> Interactive = [];

    public IReadOnlyList<ChannelCall> Calls { get { lock (_calls) return [.. _calls]; } }

    private void Add(ChannelCall c) { lock (_calls) _calls.Add(c); }

    void IActionChannel.SetImage(string context, string? image, int? state, Target target, UpdatePriority priority)
    {
        var p = new JsonObject { ["image"] = image };
        if (state is not null) p["state"] = state;
        if (target != Target.Both) p["target"] = (int)target;
        Add(new("setImage", context, p, priority));
    }

    void IActionChannel.SetTitle(string context, string? title, int? state, Target target, UpdatePriority priority) =>
        Add(new("setTitle", context, new JsonObject { ["title"] = title }, priority));

    void IActionChannel.SetFeedback(string context, JsonObject payload, UpdatePriority priority) => Add(new("setFeedback", context, payload.DeepClone(), priority));
    void IActionChannel.SetFeedbackLayout(string context, string layout, UpdatePriority priority) => Add(new("setFeedbackLayout", context, new JsonObject { ["layout"] = layout }, priority));
    void IActionChannel.MarkInteractive(string context) { lock (_calls) Interactive.Add(context); }
    void IActionChannel.Send(string context, string evt, JsonNode? payload, string? action) => Add(new(evt, context, payload?.DeepClone()));
    void IActionChannel.OpenUrl(string url) => Add(new("openUrl", "", new JsonObject { ["url"] = url }));
    void IActionChannel.LogMessage(string message) => Add(new("logMessage", "", new JsonObject { ["message"] = message }));
    void IActionChannel.SwitchToProfile(string deviceId, string? profile, int? page) =>
        Add(new("switchToProfile", deviceId, new JsonObject { ["profile"] = profile, ["page"] = page }));
}

/// <summary>In-memory global settings for tests.</summary>
public sealed class TestGlobalSettings : IGlobalSettings
{
    private JsonObject _settings;

    public TestGlobalSettings(JsonObject? initial = null) => _settings = initial ?? new JsonObject();

    public bool IsLoaded => true;
    public Task WaitForLoadAsync(TimeSpan timeout) => Task.CompletedTask;
    public JsonObject Snapshot() => (JsonObject)_settings.DeepClone();
    public T GetSection<T>(string section) where T : class, new() => ActionJson.ReadOrDefault<T>(_settings[section]);

    public void SetSection<T>(string section, T value) where T : class
    {
        _settings[section] = ActionJson.ToNode(value);
        Changed?.Invoke(this, new GlobalSettingsChangedEventArgs(Snapshot(), false));
    }

    public CoreSettings Core => GetSection<CoreSettings>("core");
    public event EventHandler<GlobalSettingsChangedEventArgs>? Changed;

    /// <summary>
    /// Simulates didReceiveGlobalSettings: the property inspector (e.g. a <c>global:eq.backend</c> field) replaced the
    /// whole object. Raises <see cref="Changed"/> with FromStreamDeck = true.
    /// </summary>
    public void ReceiveFromStreamDeck(JsonObject settings)
    {
        _settings = (JsonObject)settings.DeepClone();
        Changed?.Invoke(this, new GlobalSettingsChangedEventArgs(Snapshot(), true));
    }
}

/// <summary>
/// Runs ONE action instance without the Stream Deck app or a WebSocket: appear it on a device, drive input,
/// advance a manual clock, and inspect every image/feedback/settings call it made.
/// <code>
/// await using var h = await ActionHarness&lt;MyDial&gt;.AppearAsync(TestDevices.Galleon, new(0, 1), Controller.Encoder);
/// await h.RotateAsync(+12);
/// Assert.Contains("42", h.FeedbackText("value"));
/// h.AssertFramesAreDeckSafe();
/// </code>
/// </summary>
public sealed class ActionHarness<TAction> : IAsyncDisposable where TAction : ActionBase, new()
{
    private readonly ActionEnvironment _env;
    private bool _disappeared;

    private ActionHarness(TAction action, ManualTimeProvider time, ServiceRegistry services, TestGlobalSettings globals, string context, DeviceInfo device, Controller controller, Coordinates coords, bool safeMode)
    {
        Action = action;
        Time = time;
        Services = services;
        GlobalSettings = globals;
        Context = context;
        Device = device;
        Controller = controller;
        Coordinates = coords;
        Channel = new RecordingChannel();
        _env = new ActionEnvironment { Channel = Channel, Log = NullLog.Instance, Services = services, GlobalSettings = globals, Time = time, SafeMode = safeMode };
    }

    public TAction Action { get; }
    public RecordingChannel Channel { get; }
    public ManualTimeProvider Time { get; }
    public ServiceRegistry Services { get; }
    public TestGlobalSettings GlobalSettings { get; }
    public string Context { get; }
    public DeviceInfo Device { get; }
    public Controller Controller { get; }
    public Coordinates Coordinates { get; }
    public string ActionUuid => typeof(TAction).GetCustomAttributes(typeof(StreamDeckActionAttribute), false).OfType<StreamDeckActionAttribute>().FirstOrDefault()?.Uuid ?? typeof(TAction).Name;

    /// <summary>
    /// Creates the action and delivers willAppear. Register fake services in <paramref name="configureServices"/> first.
    /// Pass <paramref name="time"/> to share one clock between the harness and your fake services (build them with the same
    /// <see cref="ManualTimeProvider"/>; <see cref="AdvanceAsync"/> then moves both). <paramref name="safeMode"/> sets
    /// <c>ActionBase.SafeMode</c>; <paramref name="globals"/> lets several harnesses share one settings store.
    /// </summary>
    public static async Task<ActionHarness<TAction>> AppearAsync(DeviceInfo? device = null, Coordinates? coordinates = null, Controller controller = Controller.Keypad,
        object? settings = null, Action<ServiceRegistry>? configureServices = null, JsonObject? globalSettings = null, bool inMultiAction = false,
        ManualTimeProvider? time = null, bool safeMode = false, TestGlobalSettings? globals = null, string context = "ctx-test")
    {
        var services = new ServiceRegistry();
        configureServices?.Invoke(services);
        var h = new ActionHarness<TAction>(new TAction(), time ?? new ManualTimeProvider(), services, globals ?? new TestGlobalSettings(globalSettings),
            context, device ?? TestDevices.StreamDeck, controller, coordinates ?? new Coordinates(0, 0), safeMode);
        var appear = new WillAppearEvent(h.Context, h.ActionUuid, h.Device.Id, controller, h.Coordinates, 0, inMultiAction)
        {
            RawSettings = settings is null ? new JsonObject() : ActionJson.ToNode(settings) as JsonObject,
        };
        h.Action.Bind(h._env, appear, h.Device);
        h.Action.Deliver(appear);
        await h.SettleAsync();
        return h;
    }

    // ------------------------------------------------------------------ input

    public Task KeyDownAsync() => DeliverAsync(new KeyDownEvent(Context, ActionUuid, Device.Id, Coordinates, Action.State, null, false) { RawSettings = Settings() });
    public Task KeyUpAsync() => DeliverAsync(new KeyUpEvent(Context, ActionUuid, Device.Id, Coordinates, Action.State, null, false) { RawSettings = Settings() });

    /// <summary>Key down, advance the clock by <paramref name="hold"/> (default 50 ms), key up.</summary>
    public async Task PressAsync(TimeSpan? hold = null)
    {
        await KeyDownAsync();
        await AdvanceAsync(hold ?? TimeSpan.FromMilliseconds(50));
        await KeyUpAsync();
    }

    public Task RotateAsync(int ticks, bool pressed = false) => DeliverAsync(new DialRotateEvent(Context, ActionUuid, Device.Id, Coordinates, ticks, pressed) { RawSettings = Settings() });
    public Task DialDownAsync() => DeliverAsync(new DialDownEvent(Context, ActionUuid, Device.Id, Coordinates) { RawSettings = Settings() });
    public Task DialUpAsync() => DeliverAsync(new DialUpEvent(Context, ActionUuid, Device.Id, Coordinates) { RawSettings = Settings() });

    public async Task DialPressAsync(TimeSpan? hold = null)
    {
        await DialDownAsync();
        await AdvanceAsync(hold ?? TimeSpan.FromMilliseconds(50));
        await DialUpAsync();
    }

    /// <summary>Stream Deck + touch strip tap (segment-local 0..200 × 0..100). Throws on devices without touch, like the real thing never sends it.</summary>
    public Task TapAsync(int x, int y, bool hold = false)
    {
        if (!Device.Capabilities.HasTouchStrip) throw new InvalidOperationException($"{Device.Name} has no touch strip; touchTap never arrives there.");
        return DeliverAsync(new TouchTapEvent(Context, ActionUuid, Device.Id, Coordinates, x, y, hold) { RawSettings = Settings() });
    }

    /// <summary>The property inspector changed settings (didReceiveSettings).</summary>
    public Task SettingsFromPropertyInspectorAsync(object settings) =>
        DeliverAsync(new DidReceiveSettingsEvent(Context, ActionUuid, Device.Id, Coordinates, Action.State, false) { RawSettings = ActionJson.ToNode(settings) as JsonObject });

    public Task PropertyInspectorAppearAsync() => DeliverAsync(new PropertyInspectorDidAppearEvent(Context, ActionUuid, Device.Id));

    /// <summary>Sends {type, data, requestId?} from the PI; returns what the plugin sent back to the PI in response.</summary>
    public async Task<JsonNode?> PiMessageAsync(string type, object? data = null, int? requestId = null)
    {
        var before = Channel.Calls.Count;
        var payload = new JsonObject { ["type"] = type, ["data"] = ActionJson.ToNode(data) };
        if (requestId is not null) payload["requestId"] = requestId;
        await DeliverAsync(new SendToPluginEvent(Context, ActionUuid, payload));
        return Channel.Calls.Skip(before).LastOrDefault(c => c.Kind == "sendToPropertyInspector")?.Payload;
    }

    public async Task DisappearAsync()
    {
        if (_disappeared) return;
        _disappeared = true;
        Action.Deliver(new WillDisappearEvent(Context, ActionUuid, Device.Id, Controller, Coordinates));
        await SettleAsync();
        await Action.UnbindAsync();
    }

    /// <summary>Advances the manual clock (firing render loops and long-press timers) and waits for the mailbox.</summary>
    public async Task AdvanceAsync(TimeSpan by)
    {
        // Step from timer to timer so callbacks that re-arm (render loops) see the time they ran at.
        var remaining = by;
        while (remaining > TimeSpan.Zero)
        {
            var next = Time.UntilNextTimer;
            var step = next is { } n && n > TimeSpan.Zero && n < remaining ? n : remaining;
            Time.Advance(step);
            remaining -= step;
            await SettleAsync();
        }
    }

    /// <summary>Fires due timers and waits until the action's mailbox is empty.</summary>
    public async Task SettleAsync()
    {
        for (var i = 0; i < 20; i++)
        {
            Time.Advance(TimeSpan.Zero);
            await Action.WhenIdleAsync();
            await Task.Yield();
            await Action.WhenIdleAsync();
            if (i > 1) break;
        }
    }

    private async Task DeliverAsync(ActionEvent e)
    {
        Action.Deliver(e);
        await SettleAsync();
    }

    private JsonObject? Settings() => Channel.Calls.LastOrDefault(c => c.Kind == "setSettings")?.Payload?.DeepClone() as JsonObject;

    // ------------------------------------------------------------------ inspection

    public IReadOnlyList<ChannelCall> Calls => Channel.Calls;
    public IReadOnlyList<ChannelCall> CallsOf(string kind) => Channel.Calls.Where(c => c.Kind == kind).ToList();
    public string? LastImage => Channel.Calls.LastOrDefault(c => c.Kind == "setImage")?.Image;
    public string? LastSvg => DataUri.TryDecodeSvg(LastImage, out var svg) ? svg : null;
    public string? LastLayout => Channel.Calls.LastOrDefault(c => c.Kind == "setFeedbackLayout")?.Payload?["layout"]?.GetValue<string>();
    public JsonObject? LastSettings => Channel.Calls.LastOrDefault(c => c.Kind == "setSettings")?.Payload as JsonObject;
    public T LastSettingsAs<T>() where T : class, new() => LastSettings?.Deserialize<T>(ActionJson.Options) ?? new T();
    public int Count(string kind) => Channel.Calls.Count(c => c.Kind == kind);

    /// <summary>All feedback sent since the last layout change, merged key by key (what the dial shows now).</summary>
    public JsonObject Feedback
    {
        get
        {
            var merged = new JsonObject();
            foreach (var c in Channel.Calls)
            {
                if (c.Kind == "setFeedbackLayout") merged = new JsonObject();
                if (c.Kind != "setFeedback" || c.Payload is not JsonObject o) continue;
                foreach (var (k, v) in o) merged[k] = v?.DeepClone();
            }
            return merged;
        }
    }

    /// <summary>The current text of a feedback item (implicit string or explicit {value}).</summary>
    public string? FeedbackText(string key) => Feedback[key] switch
    {
        JsonValue v when v.TryGetValue<string>(out var s) => s,
        JsonObject o => o["value"]?.ToString(),
        var n => n?.ToString(),
    };

    /// <summary>The decoded SVG of a pixmap feedback item.</summary>
    public string? FeedbackSvg(string key) => DataUri.TryDecodeSvg(FeedbackText(key), out var svg) ? svg : null;

    /// <summary>Lints every key image and every pixmap feedback the action produced against the hardware rules.</summary>
    public void AssertFramesAreDeckSafe()
    {
        var problems = new List<string>();
        foreach (var c in Channel.Calls)
        {
            if (c.Kind == "setImage" && c.Image is { } img && img.StartsWith("data:image/svg", StringComparison.Ordinal))
                problems.AddRange(SvgLint.Check(img, Controller == Controller.Keypad ? SvgCanvas.Key : SvgCanvas.Any).Where(i => i.Severity == LintSeverity.Error).Select(i => "setImage: " + i));
            if (c.Kind == "setFeedback" && c.Payload is JsonObject o)
                foreach (var (k, v) in o)
                {
                    var s = v is JsonValue jv && jv.TryGetValue<string>(out var str) ? str : (v as JsonObject)?["value"]?.ToString();
                    if (s is not null && s.StartsWith("data:image/svg", StringComparison.Ordinal))
                        problems.AddRange(SvgLint.Check(s, SvgCanvas.Any).Where(i => i.Severity == LintSeverity.Error).Select(i => $"feedback '{k}': " + i));
                }
        }
        if (problems.Count > 0) throw new AssertException("frames are not Stream Deck safe:\n  " + string.Join("\n  ", problems.Distinct()));
    }

    public async ValueTask DisposeAsync() => await DisappearAsync();
}
