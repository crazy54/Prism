using System.Reflection;
using System.Text.Json;
using System.Text.Json.Nodes;
using PrismControl.Core.Devices;
using PrismControl.Core.Hosting;
using PrismControl.Core.Layouts;
using PrismControl.Core.PropertyInspector;
using PrismControl.Core.Render;
using PrismControl.Core.Render.Tokens;
using PrismControl.Core.Scheduling;

namespace PrismControl.Core.Actions;

/// <summary>
/// Base of every action instance. One instance exists per context (one placed key/dial), created on willAppear and
/// disposed after willDisappear. All handlers for an instance run one at a time in its mailbox; use <see cref="Post"/>
/// to get back onto it from other threads (SMTC/Core Audio callbacks arrive on thread-pool threads).
/// Derive from <see cref="KeyAction{TSettings}"/> or <see cref="DialAction{TSettings}"/>, not from this class.
/// </summary>
public abstract class ActionBase
{
    private ActionEnvironment? _env;
    private ActionMailbox? _mailbox;
    private readonly List<RenderLoop> _loops = [];
    private ITimer? _keyTimer, _dialTimer;
    private bool _keyDown, _keyLongFired, _dialDown, _dialLongFired;
    private int _pressToken;
    private long _lastInput;
    private bool _hasInput;
    private bool _handlesKeyLongPress, _handlesDialLongPress;

    public string Context { get; private set; } = "";
    public string ActionUuid { get; private set; } = "";
    public DeviceInfo Device { get; private set; } = DeviceInfo.Unknown("");
    public Controller Controller { get; private set; }
    public Coordinates? Coordinates { get; private set; }
    public int State { get; private set; }
    public bool IsInMultiAction { get; private set; }
    public bool IsPropertyInspectorVisible { get; private set; }
    /// <summary>Between willAppear and willDisappear.</summary>
    public bool IsVisible { get; private set; }

    public bool IsKey => Controller == Controller.Keypad;
    public bool IsDial => Controller == Controller.Encoder;
    /// <summary>For Encoder instances: which dial/layer and where it shows (Galleon quadrant or Stream Deck + segment).</summary>
    public EncoderPlacement? Encoder => IsDial && Coordinates is { } c ? EncoderPlacement.For(Device, c) : null;

    /// <summary>Default priority for this instance's frames. Use Background for stats; input makes it Interactive automatically.</summary>
    public UpdatePriority DefaultPriority { get; set; } = UpdatePriority.Normal;
    /// <summary>Hold time before <see cref="OnKeyLongPressAsync"/> / <see cref="OnDialLongPressAsync"/> fire.</summary>
    public TimeSpan LongPressThreshold { get; set; } = TimeSpan.FromMilliseconds(500);
    /// <summary>How long after the last input the instance counts as interactive (render loops use their active interval).</summary>
    public TimeSpan ActiveWindow { get; set; } = TimeSpan.FromSeconds(2);

    protected ILog Log => Env.Log;
    protected IServiceRegistry Services => Env.Services;
    protected IGlobalSettings GlobalSettings => Env.GlobalSettings;
    protected TimeProvider Time => Env.Time;

    /// <summary>
    /// Safe mode (<c>PRISM_CONTROL_SAFE_MODE=1</c>; the fake host and the E2E suite always set it). While it is true, any
    /// write that changes this PC (volume, devices, EQ, playback, input, launching) must be a no-op or a fake.
    /// Prefer gating in your module's service; check this only for writes an action makes directly.
    /// </summary>
    public bool SafeMode => _env?.SafeMode ?? SafeModeEnvironment.FromEnvironment();

    /// <summary>The Refraction palette to draw with (global "core.theme" unless <see cref="ThemeName"/> overrides it).</summary>
    public RefractionPalette Theme => Themes.Resolve(ThemeName ?? (_env is null ? null : GlobalSettings.Core.Theme));
    /// <summary>Override to let a per-action setting pick "night"/"day".</summary>
    protected virtual string? ThemeName => null;

    /// <summary>True within <see cref="ActiveWindow"/> of the last key/dial/touch input (never before the first input).</summary>
    public bool IsInteractive => _env is not null && _hasInput && Time.GetElapsedTime(_lastInput) < ActiveWindow;
    private bool CanDisplay => IsVisible && !IsInMultiAction;

    private ActionEnvironment Env => _env ?? throw new InvalidOperationException("The action is not bound to a context yet (do work in OnWillAppearAsync, not the constructor).");

    // ------------------------------------------------------------------ handlers (override these)

    protected virtual Task OnWillAppearAsync(WillAppearEvent e) => Task.CompletedTask;
    protected virtual Task OnWillDisappearAsync(WillDisappearEvent e) => Task.CompletedTask;

    protected virtual Task OnKeyDownAsync(KeyDownEvent e) => Task.CompletedTask;
    protected virtual Task OnKeyUpAsync(KeyUpEvent e) => Task.CompletedTask;
    /// <summary>A completed press (down+up). If <see cref="OnKeyLongPressAsync"/> is overridden, only presses shorter than the threshold.</summary>
    protected virtual Task OnKeyPressAsync(KeyUpEvent e) => Task.CompletedTask;
    /// <summary>Fires while the key is still held, once the hold reaches <see cref="LongPressThreshold"/>. Works on every device.</summary>
    protected virtual Task OnKeyLongPressAsync(KeyDownEvent e) => Task.CompletedTask;

    /// <summary>Galleon sends up to ±12 aggregated ticks per event; Stream Deck + sends ±1.</summary>
    protected virtual Task OnDialRotateAsync(DialRotateEvent e) => Task.CompletedTask;
    protected virtual Task OnDialDownAsync(DialDownEvent e) => Task.CompletedTask;
    protected virtual Task OnDialUpAsync(DialUpEvent e) => Task.CompletedTask;
    /// <summary>A completed dial press (down+up).</summary>
    protected virtual Task OnDialPressAsync(DialUpEvent e) => Task.CompletedTask;
    /// <summary>
    /// Only raised where <see cref="DeviceCapabilities.SupportsDialLongPress"/> is true (Stream Deck +). NEVER on Galleon,
    /// whose ~4 s hold is consumed by the device to switch layers. Always provide another way to reach the same function.
    /// </summary>
    protected virtual Task OnDialLongPressAsync(DialDownEvent e) => Task.CompletedTask;
    /// <summary>Stream Deck + only. <see cref="TouchTapEvent.Hold"/> = long touch.</summary>
    protected virtual Task OnTouchTapAsync(TouchTapEvent e) => Task.CompletedTask;

    protected virtual Task OnPropertyInspectorAppearedAsync() => Task.CompletedTask;
    protected virtual Task OnPropertyInspectorDisappearedAsync() => Task.CompletedTask;
    /// <summary>A typed PI message <c>{type, data, requestId?}</c>. The return value is sent back as <c>pi.response</c> when the PI asked with a requestId.</summary>
    protected virtual Task<object?> OnPiMessageAsync(string type, JsonNode? data) => Task.FromResult<object?>(null);
    /// <summary>A PI payload that does not follow the <c>{type, data}</c> convention.</summary>
    protected virtual Task OnSendToPluginAsync(JsonNode? payload) => Task.CompletedTask;
    protected virtual Task OnTitleParametersChangedAsync(TitleParametersDidChangeEvent e) => Task.CompletedTask;
    /// <summary>An auto-generated settings form for pi/default.html (null = no form).</summary>
    protected virtual PiForm? DescribeForm() => null;
    /// <summary>Extra data for the PI's hello message (status text, device lists...).</summary>
    protected virtual object? DescribeState() => null;

    // ------------------------------------------------------------------ commands

    /// <summary>Queues a key image (goes through the update scheduler: latest-wins, only changes, global budget).</summary>
    public void SetImage(SvgDocument svg, int? state = null, Target target = Target.Both) => SetImage(svg.ToDataUri(), state, target);

    /// <summary>Queues a key image: a data URL (raw SVG markup is converted), a plugin-relative path, or null to restore the manifest image.</summary>
    public void SetImage(string? image, int? state = null, Target target = Target.Both)
    {
        if (!CanDisplay) return;
        if (image is not null && image.TrimStart().StartsWith('<')) image = DataUri.Svg(image);
        Env.Channel.SetImage(Context, image, state, target, DefaultPriority);
    }

    public void ResetImage(int? state = null) => SetImage((string?)null, state);

    public void SetTitle(string? title, int? state = null, Target target = Target.Both)
    {
        if (!CanDisplay) return;
        Env.Channel.SetTitle(Context, title, state, target, DefaultPriority);
    }

    public void SetState(int state)
    {
        State = state;
        Env.Channel.Send(Context, "setState", new JsonObject { ["state"] = state });
    }

    public void ShowOk() => Env.Channel.Send(Context, "showOk", null);
    public void ShowAlert() => Env.Channel.Send(Context, "showAlert", null);

    /// <summary>Queues dial feedback (keys merge, newest value per key; unchanged keys are not resent).</summary>
    public void SetFeedback(Feedback feedback) => SetFeedback(feedback.ToJson());

    public void SetFeedback(JsonObject payload)
    {
        if (!CanDisplay || !IsDial) return;
        Env.Channel.SetFeedback(Context, payload, DefaultPriority);
    }

    /// <summary>Switches the dial layout ("$B1" or "layouts/x.json"). Feedback sent after this applies to the new layout.</summary>
    public void SetFeedbackLayout(string layout)
    {
        if (!CanDisplay || !IsDial) return;
        Env.Channel.SetFeedbackLayout(Context, layout, DefaultPriority);
    }

    /// <summary>Changes the dial's trigger descriptions; all null restores the manifest values.</summary>
    public void SetTriggerDescription(string? rotate = null, string? push = null, string? touch = null, string? longTouch = null)
    {
        if (!IsDial) return;
        var p = new JsonObject();
        if (rotate is not null) p["rotate"] = rotate;
        if (push is not null) p["push"] = push;
        if (touch is not null) p["touch"] = touch;
        if (longTouch is not null) p["longTouch"] = longTouch;
        Env.Channel.Send(Context, "setTriggerDescription", p);
    }

    /// <summary>Sends <c>{type, data}</c> to this instance's property inspector (only delivered while it is open).</summary>
    public void SendToPropertyInspector(string type, object? data = null) =>
        SendToPropertyInspectorRaw(new JsonObject { ["type"] = type, ["data"] = ActionJson.ToNode(data) });

    public void SendToPropertyInspectorRaw(JsonNode payload) => Env.Channel.Send(Context, "sendToPropertyInspector", payload, ActionUuid);

    /// <summary>
    /// Makes the default PI re-request <c>optionsFrom</c> lists (all of them when <paramref name="optionsFrom"/> is empty),
    /// keeping the current selection. Call it when a list changed (a device appeared, the EQ backend switched).
    /// Does nothing while the PI is closed: it requests fresh lists every time it opens.
    /// </summary>
    public void RefreshPropertyInspectorOptions(params string[] optionsFrom)
    {
        if (!IsPropertyInspectorVisible) return;
        SendToPropertyInspector("pi.refresh", optionsFrom.Length == 0 ? null : new { lists = optionsFrom });
    }

    /// <summary>Re-sends the hello (form, state, settings) so the default PI rebuilds its form, e.g. when the fields depend on a setting.</summary>
    public void RefreshPropertyInspectorForm()
    {
        if (!IsPropertyInspectorVisible) return;
        SendToPropertyInspector("pi.hello", Hello());
    }

    public void OpenUrl(string url) => Env.Channel.OpenUrl(url);

    /// <summary>Asks the app for this instance's settings; the answer arrives as a settings change.</summary>
    public void RequestSettings() => Env.Channel.Send(Context, "getSettings", null);

    /// <summary>Switches this device to one of the plugin's bundled profiles (plugins cannot switch to user profiles).</summary>
    public void SwitchToProfile(string profile, int? page = null) => Env.Channel.SwitchToProfile(Device.Id, profile, page);

    /// <summary>
    /// Starts a render loop that calls <paramref name="render"/> every <paramref name="idleInterval"/>, or every
    /// <paramref name="activeInterval"/> while the user interacts. Stops automatically on willDisappear.
    /// </summary>
    public RenderLoop StartRenderLoop(Func<CancellationToken, Task> render, TimeSpan idleInterval, TimeSpan? activeInterval = null)
    {
        var loop = new RenderLoop(this, render, idleInterval, activeInterval ?? idleInterval, Time);
        lock (_loops) _loops.Add(loop);
        return loop;
    }

    public RenderLoop StartRenderLoop(Action render, TimeSpan idleInterval, TimeSpan? activeInterval = null) =>
        StartRenderLoop(_ => { render(); return Task.CompletedTask; }, idleInterval, activeInterval);

    /// <summary>Runs <paramref name="work"/> in this instance's mailbox (serialized with its handlers). Safe from any thread.</summary>
    public bool Post(Func<Task> work) => _mailbox?.Post(work) ?? false;

    public bool Post(Action work) => Post(() => { work(); return Task.CompletedTask; });

    // ------------------------------------------------------------------ host plumbing

    internal abstract void ApplySettings(JsonObject? raw);
    internal abstract JsonNode? SettingsJson();
    internal abstract Task RaiseSettingsChangedAsync();

    private protected void SendSettingsCore(JsonObject settings) => Env.Channel.Send(Context, "setSettings", settings);

    internal void Bind(ActionEnvironment env, WillAppearEvent appear, DeviceInfo device)
    {
        _env = env;
        Context = appear.Context;
        ActionUuid = appear.ActionUuid;
        Device = device;
        Controller = appear.Controller;
        Coordinates = appear.Coordinates;
        IsInMultiAction = appear.IsInMultiAction;
        State = appear.State ?? 0;
        _handlesKeyLongPress = IsOverridden(nameof(OnKeyLongPressAsync));
        _handlesDialLongPress = IsOverridden(nameof(OnDialLongPressAsync));
        ApplySettings(appear.RawSettings);
        var log = env.Log;
        _mailbox = new ActionMailbox(
            ex => log.Error($"{ActionUuid} [{Context}] handler failed", ex),
            slow => log.Warn($"{ActionUuid} [{Context}] a handler ran {slow.TotalMilliseconds:0} ms; do slow work off the mailbox (await I/O, use Task.Run for CPU)."));
    }

    internal void UpdateDevice(DeviceInfo device) => Device = device;

    internal void Deliver(ActionEvent e) => Post(() => HandleAsync(e));

    internal Task WhenIdleAsync() => _mailbox?.WhenIdleAsync() ?? Task.CompletedTask;

    internal async Task UnbindAsync()
    {
        StopLoopsAndTimers();
        if (_mailbox is { } m) await m.CompleteAsync().ConfigureAwait(false);
        if (this is IAsyncDisposable ad) await ad.DisposeAsync().ConfigureAwait(false);
        else if (this is IDisposable d) d.Dispose();
    }

    private async Task HandleAsync(ActionEvent e)
    {
        if (e.RawSettings is { } raw && e is not WillAppearEvent) ApplySettings(raw);
        switch (e)
        {
            case WillAppearEvent a:
                Coordinates = a.Coordinates;
                IsInMultiAction = a.IsInMultiAction;
                if (a.State is { } st) State = st;
                IsVisible = true;
                await OnWillAppearAsync(a).ConfigureAwait(false);
                break;
            case WillDisappearEvent d:
                IsVisible = false;
                StopLoopsAndTimers();
                await OnWillDisappearAsync(d).ConfigureAwait(false);
                break;
            case KeyDownEvent kd:
                if (kd.State is { } s1) State = s1;
                MarkInput();
                _keyDown = true;
                _keyLongFired = false;
                var token = ++_pressToken;
                await OnKeyDownAsync(kd).ConfigureAwait(false);
                if (_handlesKeyLongPress)
                {
                    _keyTimer?.Dispose();
                    _keyTimer = Time.CreateTimer(_ => Post(async () =>
                    {
                        if (!_keyDown || _keyLongFired || token != _pressToken) return;
                        _keyLongFired = true;
                        await OnKeyLongPressAsync(kd).ConfigureAwait(false);
                    }), null, LongPressThreshold, Timeout.InfiniteTimeSpan);
                }
                break;
            case KeyUpEvent ku:
                if (ku.State is { } s2) State = s2;
                MarkInput();
                _keyDown = false;
                _keyTimer?.Dispose();
                _keyTimer = null;
                await OnKeyUpAsync(ku).ConfigureAwait(false);
                if (!_keyLongFired) await OnKeyPressAsync(ku).ConfigureAwait(false);
                _keyLongFired = false;
                break;
            case DialRotateEvent r:
                MarkInput();
                await OnDialRotateAsync(r).ConfigureAwait(false);
                break;
            case DialDownEvent dd:
                MarkInput();
                _dialDown = true;
                _dialLongFired = false;
                var dtoken = ++_pressToken;
                await OnDialDownAsync(dd).ConfigureAwait(false);
                if (_handlesDialLongPress && Device.Capabilities.SupportsDialLongPress)
                {
                    _dialTimer?.Dispose();
                    _dialTimer = Time.CreateTimer(_ => Post(async () =>
                    {
                        if (!_dialDown || _dialLongFired || dtoken != _pressToken) return;
                        _dialLongFired = true;
                        await OnDialLongPressAsync(dd).ConfigureAwait(false);
                    }), null, LongPressThreshold, Timeout.InfiniteTimeSpan);
                }
                break;
            case DialUpEvent du:
                MarkInput();
                _dialDown = false;
                _dialTimer?.Dispose();
                _dialTimer = null;
                await OnDialUpAsync(du).ConfigureAwait(false);
                if (!_dialLongFired) await OnDialPressAsync(du).ConfigureAwait(false);
                _dialLongFired = false;
                break;
            case TouchTapEvent t:
                MarkInput();
                await OnTouchTapAsync(t).ConfigureAwait(false);
                break;
            case DidReceiveSettingsEvent ds:
                if (ds.State is { } s3) State = s3;
                await RaiseSettingsChangedAsync().ConfigureAwait(false);
                break;
            case PropertyInspectorDidAppearEvent:
                IsPropertyInspectorVisible = true;
                await OnPropertyInspectorAppearedAsync().ConfigureAwait(false);
                break;
            case PropertyInspectorDidDisappearEvent:
                IsPropertyInspectorVisible = false;
                await OnPropertyInspectorDisappearedAsync().ConfigureAwait(false);
                break;
            case SendToPluginEvent sp:
                await HandlePiAsync(sp.Payload).ConfigureAwait(false);
                break;
            case TitleParametersDidChangeEvent tp:
                await OnTitleParametersChangedAsync(tp).ConfigureAwait(false);
                break;
        }
    }

    private async Task HandlePiAsync(JsonNode? payload)
    {
        if (payload is JsonObject o && o["type"] is JsonValue tv && tv.TryGetValue<string>(out var type))
        {
            var data = o["data"];
            JsonNode? requestId = o["requestId"]?.DeepClone();
            if (type == "pi.ready")
            {
                SendToPropertyInspector("pi.hello", Hello());
                return;
            }
            object? result = null;
            string? error = null;
            try { result = await OnPiMessageAsync(type, data).ConfigureAwait(false); }
            catch (Exception ex)
            {
                error = ex.Message;
                Log.Warn($"{ActionUuid} PI message '{type}' failed", ex);
            }
            if (requestId is not null)
            {
                SendToPropertyInspectorRaw(new JsonObject
                {
                    ["type"] = "pi.response",
                    ["requestId"] = requestId,
                    ["ok"] = error is null,
                    ["data"] = ActionJson.ToNode(result),
                    ["error"] = error,
                });
            }
            return;
        }
        await OnSendToPluginAsync(payload).ConfigureAwait(false);
    }

    private JsonObject Hello()
    {
        var caps = Device.Capabilities;
        return new JsonObject
        {
            ["action"] = ActionUuid,
            ["context"] = Context,
            ["controller"] = Controller.ToString(),
            ["coordinates"] = Coordinates is { } c ? new JsonObject { ["column"] = c.Column, ["row"] = c.Row } : null,
            ["device"] = new JsonObject
            {
                ["id"] = Device.Id,
                ["name"] = Device.Name,
                ["type"] = (int)Device.Type,
                ["columns"] = Device.Columns,
                ["rows"] = Device.Rows,
                ["isGalleon"] = Device.IsGalleon,
                ["isPlus"] = Device.IsPlus,
                ["hasTouch"] = caps.HasTouchStrip,
                ["dialLongPress"] = caps.SupportsDialLongPress,
            },
            ["encoder"] = Encoder?.ToString(),
            ["theme"] = Theme.Name,
            ["settings"] = SettingsJson(),
            ["form"] = DescribeForm()?.ToJson(),
            ["state"] = ActionJson.ToNode(DescribeState()),
        };
    }

    private void MarkInput()
    {
        _lastInput = Time.GetTimestamp();
        _hasInput = true;
        Env.Channel.MarkInteractive(Context);
        RenderLoop[] loops;
        lock (_loops) loops = [.. _loops];
        foreach (var l in loops) l.OnInput();
    }

    private void StopLoopsAndTimers()
    {
        RenderLoop[] loops;
        lock (_loops) { loops = [.. _loops]; _loops.Clear(); }
        foreach (var l in loops) l.Stop();
        _keyTimer?.Dispose();
        _dialTimer?.Dispose();
        _keyTimer = _dialTimer = null;
    }

    private bool IsOverridden(string method)
    {
        var m = GetType().GetMethod(method, BindingFlags.Instance | BindingFlags.NonPublic);
        return m is not null && m.GetBaseDefinition().DeclaringType != m.DeclaringType;
    }
}

/// <summary>An action with typed, per-context settings (stored by the app, edited in the property inspector).</summary>
public abstract class ActionBase<TSettings> : ActionBase where TSettings : class, new()
{
    /// <summary>The current settings (refreshed from every event that carries them).</summary>
    public TSettings Settings { get; private set; } = new();

    /// <summary>Stores settings in the app (they travel with the profile; never put secrets here).</summary>
    public void SetSettings(TSettings settings)
    {
        Settings = settings;
        SaveSettings();
    }

    /// <summary>Persists the current <see cref="Settings"/> object after you mutated it.</summary>
    public void SaveSettings()
    {
        if (SettingsJson() is JsonObject o) SendSettings(o);
    }

    /// <summary>Settings changed in the property inspector (or after <see cref="ActionBase.RequestSettings"/>).</summary>
    protected virtual Task OnSettingsChangedAsync(TSettings settings) => Task.CompletedTask;

    internal override void ApplySettings(JsonObject? raw)
    {
        if (raw is null) return;
        // Imported profiles can carry nulls or wrong types: an invalid property keeps its default (logged), never a null
        // that throws on every render; unreadable settings fall back to new TSettings().
        var problems = new List<string>();
        Settings = ActionJson.ReadOrDefault<TSettings>(raw, problems);
        if (problems.Count > 0) Log.Warn($"{ActionUuid}: invalid settings ignored, using defaults for: {string.Join("; ", problems)}");
    }

    internal override JsonNode? SettingsJson() => ActionJson.ToNode(Settings);

    internal override Task RaiseSettingsChangedAsync() => OnSettingsChangedAsync(Settings);

    private void SendSettings(JsonObject o) => SendSettingsCore(o);
}

/// <summary>A key (Keypad) action. Render with <see cref="ActionBase.SetImage(SvgDocument, int?, Target)"/>.</summary>
public abstract class KeyAction<TSettings> : ActionBase<TSettings> where TSettings : class, new();

/// <summary>
/// A dial (Encoder) action: Stream Deck + dial + strip segment, or a Galleon dial layer + screen widget.
/// May also be placed on keys if its attribute lists Keypad too (check <see cref="ActionBase.IsKey"/>).
/// </summary>
public abstract class DialAction<TSettings> : ActionBase<TSettings> where TSettings : class, new();

public abstract class KeyAction : KeyAction<NoSettings>;
public abstract class DialAction : DialAction<NoSettings>;

/// <summary>Settings type for actions without settings.</summary>
public sealed class NoSettings;
