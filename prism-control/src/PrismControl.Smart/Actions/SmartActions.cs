using System.Text.Json.Nodes;
using PrismControl.Core.Actions;
using PrismControl.Desktop.Sight;
using PrismControl.Core.Layouts;
using DeviceController = PrismControl.Core.Devices.Controller;
using PrismControl.Core.Render;
using PrismControl.Smart.Art;
using PrismControl.Smart.Control;
using PrismControl.Smart.Execution;
using PrismControl.Smart.Runtime;

namespace PrismControl.Smart.Actions;

/// <summary>Per-instance settings. <c>auto</c> = a smart slot the engine fills; <c>lock</c> = a fixed "lock page" key.</summary>
public sealed class SmartSlotSettings
{
    public string Role { get; set; } = "auto";
}

/// <summary>Shared plumbing of the Smart Key and Smart Dial: attach to the engine, render on invalidate, PI messages.</summary>
internal static class SmartActionCommon
{
    public static async Task<object?> PiAsync(SmartEngine engine, SmartSlot slot, string type, JsonNode? data, Func<object> status, Action? reload, SmartPiExtras? extras = null)
    {
        // SD2: the one-profile wizard and the AI preferences channel.
        if (extras?.Handle(type, data, slot.Device) is { } sd2) return await sd2.ConfigureAwait(false);
        switch (type)
        {
            case "smart.inspect":
                return engine.Inspect(slot);
            case "smart.pin":
                return new { ok = engine.PinCurrent(slot), inspect = engine.Inspect(slot) };
            case "smart.unpin":
                return new { ok = engine.UnpinSlot(slot), inspect = engine.Inspect(slot) };
            case "smart.hide":
                return new { ok = engine.HideCurrent(slot), inspect = engine.Inspect(slot) };
            case "smart.hidden":
                return engine.CurrentPackId is { } pid ? engine.HiddenFor(pid) : Array.Empty<string>();
            case "smart.unhide":
                if (engine.CurrentPackId is { } p2 && data?["id"]?.GetValue<string>() is { } id) engine.Unhide(p2, id);
                return engine.CurrentPackId is { } p3 ? engine.HiddenFor(p3) : Array.Empty<string>();
            case "smart.lock":
                engine.Context.SetLocked(!engine.Context.IsLocked, "lock page (property inspector)");
                return new { locked = engine.Context.IsLocked };
            case "smart.prefs":
                return engine.Preferences;
            case "smart.prefs.set":
                if (data is JsonObject o) engine.EditPreferences(p => Prefs.PreferencesPatch.Apply(p, o));
                return engine.Preferences;
            case "smart.status":
                return status();
            case "smart.reload":
                await Task.Run(() => { if (reload is not null) reload(); else engine.PacksChanged(); }).ConfigureAwait(false);
                return status();
            default:
                return null;
        }
    }
}

[StreamDeckAction("com.jeremyfhall.prismcontrol.smart.key",
    Name = "Smart Key",
    Controllers = Controllers.Keypad,
    Tooltip = "Prism draws this key for whatever is on screen: the right shortcut, tool or readout for the app in front.",
    Icon = "imgs/actions/smart/key/icon",
    KeyImage = "imgs/actions/smart/key/key",
    PropertyInspector = "pi/smart.html",
    UserTitleEnabled = false,
    ShowTitle = false,
    SupportedInMultiActions = false)]
public sealed class SmartKeyAction : KeyAction<SmartSlotSettings>
{
    private SmartEngine? _engine;
    private SmartSlot? _slot;
    private RenderLoop? _loop;
    private PairingService? _pairing;
    private bool _downToPairing;

    protected override Task OnWillAppearAsync(WillAppearEvent e)
    {
        if (!Services.TryGet<SmartEngine>(out var engine)) { SetImage(SmartArt.Key(Theme, new SlotView { Kind = SlotKind.Idle, Label = "NO ENGINE" })); return Task.CompletedTask; }
        _engine = engine;
        LongPressThreshold = engine.Options.ConfirmHold;
        Attach();
        // SD2: any Smart Key on a physical deck can carry the AI pairing prompt (the top-left one is chosen).
        if (Services.TryGet<PairingService>(out var pairing) && Coordinates is { } at)
        {
            _pairing = pairing;
            pairing.AddKey(Context, Device, at.Column, at.Row, () => Post(Render));
        }
        _loop = StartRenderLoop(Render, idleInterval: TimeSpan.FromMilliseconds(500), activeInterval: TimeSpan.FromMilliseconds(50));
        Render();
        return Task.CompletedTask;
    }

    private void Attach()
    {
        if (_engine is null || Coordinates is not { } c) return;
        if (_slot is not null) _engine.Detach(_slot);
        _slot = _engine.Attach(Context, Device, DeviceController.Keypad, c, () => Post(Render), utility: Settings.Role == "lock");
    }

    protected override Task OnSettingsChangedAsync(SmartSlotSettings settings)
    {
        Attach();
        Render();
        return Task.CompletedTask;
    }

    protected override Task OnWillDisappearAsync(WillDisappearEvent e)
    {
        if (_slot is not null) _engine?.Detach(_slot);
        _slot = null;
        _pairing?.RemoveKey(Context);
        _downToPairing = false;
        return Task.CompletedTask;
    }

    // The gesture is recorded HERE (Gestures.Begin, the first line of each handler) and tokens are minted only from its id.
    // While this key shows the AI pairing
    // prompt (SD2), its presses belong to pairing (a 1.5 s hold approves) and never run the slot's verb. A key-up goes
    // where its key-down went, so a hold that began before the prompt appeared still releases in the engine.
    protected override Task OnKeyDownAsync(KeyDownEvent e)
    {
        var gesture = Gestures.Begin(e, Time);
        if (_pairing is not null && _pairing.IsPrompt(Context))
        {
            _downToPairing = true;
            _pairing.HoldBegin(Context, Device);
            _loop?.Invalidate();
            Render();
            return Task.CompletedTask;
        }
        _downToPairing = false;
        if (_engine is null || _slot is null) return Task.CompletedTask;
        _engine.KeyDown(_slot, DeckGesture.Of(gesture));
        _loop?.Invalidate();
        return Task.CompletedTask;
    }

    protected override Task OnKeyLongPressAsync(KeyDownEvent e)
    {
        // The hold is its own, present gesture (the key is still down now): its arrival is the hold, not the key-down.
        var gesture = Gestures.BeginHold(e, Time);
        if (_downToPairing || _engine is null || _slot is null) return Task.CompletedTask;
        _engine.KeyHoldReached(_slot, DeckGesture.Of(gesture));
        return Task.CompletedTask;
    }

    protected override Task OnKeyUpAsync(KeyUpEvent e)
    {
        var gesture = Gestures.Begin(e, Time);
        if (_downToPairing)
        {
            _downToPairing = false;
            _pairing?.HoldEnd(Context);
            Render();
            return Task.CompletedTask;
        }
        if (_engine is null || _slot is null) return Task.CompletedTask;
        _engine.KeyUp(_slot, DeckGesture.Of(gesture));
        return Task.CompletedTask;
    }

    private void Render()
    {
        if (_pairing?.PromptFor(Context) is { } prompt)
        {
            SetImage(PairArt.Key(Theme, prompt));
            return;
        }
        if (_engine is null || _slot is null) return;
        var view = _engine.View(_slot);
        SetImage(SmartArt.Key(Theme, view));
    }

    protected override Task<object?> OnPiMessageAsync(string type, JsonNode? data) =>
        _engine is null || _slot is null ? Task.FromResult<object?>(null)
        : SmartActionCommon.PiAsync(_engine, _slot, type, data, () => Services.TryGet<SmartModuleStatus>(out var s) ? s.Describe(_engine) : _engine.Status(),
            Services.TryGet<SmartModuleStatus>(out var st) ? st.Reload : null, Services.TryGet<SmartPiExtras>(out var x) ? x : null);

    protected override object? DescribeState() => _engine is null || _slot is null ? null : _engine.Inspect(_slot);
}

[StreamDeckAction("com.jeremyfhall.prismcontrol.smart.dial",
    Name = "Smart Dial",
    Controllers = Controllers.Encoder,
    Tooltip = "Prism assigns this dial for whatever is on screen: turn to adjust, push for its action.",
    Icon = "imgs/actions/smart/dial/icon",
    // The key image is a square 72/144 face (manifest States image); the 200×100 art is the strip/widget background only.
    KeyImage = "imgs/actions/smart/dial/key",
    EncoderBackground = "imgs/actions/smart/dial/background",
    Layout = Layouts.Canvas.Path,
    PropertyInspector = "pi/smart.html",
    TriggerRotate = "Adjust",
    TriggerPush = "Action",
    TriggerTouch = "Action",
    SupportedInMultiActions = false)]
public sealed class SmartDialAction : DialAction<SmartSlotSettings>
{
    private SmartEngine? _engine;
    private SmartSlot? _slot;
    private RenderLoop? _loop;

    protected override Task OnWillAppearAsync(WillAppearEvent e)
    {
        SetFeedbackLayout(Layouts.Canvas.Path);
        if (!Services.TryGet<SmartEngine>(out var engine)) { SetFeedback(new Feedback().Pixmap(Layouts.Canvas.Frame, SmartArt.Dial(Theme, new SlotView { Kind = SlotKind.Idle, Label = "NO ENGINE" }))); return Task.CompletedTask; }
        _engine = engine;
        if (Coordinates is { } c) _slot = engine.Attach(Context, Device, DeviceController.Encoder, c, () => Post(Render));
        _loop = StartRenderLoop(Render, idleInterval: TimeSpan.FromMilliseconds(500), activeInterval: TimeSpan.FromMilliseconds(33));
        Render();
        return Task.CompletedTask;
    }

    protected override Task OnWillDisappearAsync(WillDisappearEvent e)
    {
        if (_slot is not null) _engine?.Detach(_slot);
        _slot = null;
        return Task.CompletedTask;
    }

    // Gestures are recorded on the first line of each dial handler; tokens are minted only from their ids.
    protected override Task OnDialRotateAsync(DialRotateEvent e)
    {
        var gesture = Gestures.Begin(e, Time);
        if (_engine is null || _slot is null) return Task.CompletedTask;
        _engine.DialRotate(_slot, e.Ticks, DeckGesture.Of(gesture));
        _loop?.Invalidate();
        return Task.CompletedTask;
    }

    protected override Task OnDialDownAsync(DialDownEvent e)
    {
        _ = Gestures.Begin(e, Time);
        if (_engine is not null && _slot is not null) _engine.DialDown(_slot);
        return Task.CompletedTask;
    }

    protected override Task OnDialPressAsync(DialUpEvent e)
    {
        var gesture = Gestures.Begin(e, Time);
        if (_engine is null || _slot is null) return Task.CompletedTask;
        _engine.DialPush(_slot, DeckGesture.Of(gesture));
        return Task.CompletedTask;
    }

    /// <summary>Stream Deck + touch on the strip segment = the same as a push (Galleon has no touch).</summary>
    protected override Task OnTouchTapAsync(TouchTapEvent e)
    {
        var gesture = Gestures.Begin(e, Time);
        if (_engine is null || _slot is null) return Task.CompletedTask;
        _engine.DialPush(_slot, DeckGesture.Of(gesture));
        return Task.CompletedTask;
    }

    private void Render()
    {
        if (_engine is null || _slot is null) return;
        var view = _engine.View(_slot);
        SetFeedback(new Feedback().Pixmap(Layouts.Canvas.Frame, SmartArt.Dial(Theme, view, active: IsInteractive)));
    }

    protected override Task<object?> OnPiMessageAsync(string type, JsonNode? data) =>
        _engine is null || _slot is null ? Task.FromResult<object?>(null)
        : SmartActionCommon.PiAsync(_engine, _slot, type, data, () => Services.TryGet<SmartModuleStatus>(out var s) ? s.Describe(_engine) : _engine.Status(),
            Services.TryGet<SmartModuleStatus>(out var st) ? st.Reload : null, Services.TryGet<SmartPiExtras>(out var x) ? x : null);

    protected override object? DescribeState() => _engine is null || _slot is null ? null : _engine.Inspect(_slot);
}
