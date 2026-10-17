using System.Text.Json.Nodes;
using PrismControl.Core.Hosting;
using PrismControl.Audio.Art;
using PrismControl.Core.Actions;
using PrismControl.Core.Layouts;
using PrismControl.Core.PropertyInspector;

namespace PrismControl.Audio;

public sealed class DeviceSwitchSettings
{
    /// <summary>Key: "cycle" through the chosen devices (all devices when none is chosen) or "set" the first one.</summary>
    public string Mode { get; set; } = "cycle";
    /// <summary>The chosen endpoint ids, in cycle order (the PI's ordered checklist). Empty = every active device.</summary>
    public string[] Devices { get; set; } = [];
    /// <summary>Wave-1 settings (four Device pickers): moved into <see cref="Devices"/>, in order, when the key loads.</summary>
    public string? Device1 { get; set; }
    public string? Device2 { get; set; }
    public string? Device3 { get; set; }
    public string? Device4 { get; set; }
    /// <summary>"all" (default + communications), "default" (console + multimedia) or "communications".</summary>
    public string Roles { get; set; } = "all";

    /// <summary>Moves Device 1-4 into <see cref="Devices"/> (which wins if both are set) and clears them. True when anything changed.</summary>
    internal bool MigrateLegacyDevices()
    {
        string?[] legacy = [Device1, Device2, Device3, Device4];
        if (legacy.All(string.IsNullOrWhiteSpace)) return false;
        if (Devices is not { Length: > 0 })
            Devices = legacy.Where(d => !string.IsNullOrWhiteSpace(d)).Select(d => d!.Trim()).Distinct(StringComparer.Ordinal).ToArray();
        Device1 = Device2 = Device3 = Device4 = null;
        return true;
    }
}

/// <summary>
/// Default-device switching (IPolicyConfig). Key: cycle through a chosen list (or set one device), showing the
/// current device. Dial: turn to browse every active endpoint, push to make it the default.
/// </summary>
public abstract class DeviceSwitchAction : AudioActionBase<DeviceSwitchSettings>
{
    private static readonly TimeSpan CursorReset = TimeSpan.FromSeconds(6);
    private string? _cursorId;
    private ITimer? _cursorTimer;

    protected abstract AudioFlow Flow { get; }

    protected override bool IsRelevant(AudioChange c) => c.Kind switch
    {
        AudioChangeKind.Sessions or AudioChangeKind.Endpoint => false,
        AudioChangeKind.Defaults => c.Flow is null || c.Flow == Flow,
        _ => true,
    };

    internal DefaultRoles Roles => Settings.Roles?.ToLowerInvariant() switch
    {
        "default" => DefaultRoles.Default,
        "communications" or "comms" => DefaultRoles.Communications,
        _ => DefaultRoles.All,
    };

    /// <summary>The role whose default we display (communications only when that is all we switch).</summary>
    private AudioRole ShownRole => Roles == DefaultRoles.Communications ? AudioRole.Communications : AudioRole.Console;

    private string? CurrentDefault => Engine?.GetDefaultId(Flow, ShownRole);

    private bool IsSetMode => string.Equals(Settings.Mode, "set", StringComparison.OrdinalIgnoreCase);

    /// <summary>The chosen devices, in order, without blanks or repeats.</summary>
    private List<string> Configured => (Settings.Devices ?? []).Where(id => !string.IsNullOrWhiteSpace(id)).Distinct(StringComparer.Ordinal).ToList();

    /// <summary>The cycle list: the chosen devices that are connected, or every active endpoint when none is chosen.</summary>
    internal List<AudioDevice> CycleList()
    {
        if (Engine is null) return [];
        var all = Engine.GetDevices(Flow);
        var chosen = Configured;
        if (chosen.Count == 0) return [.. all];
        return chosen.Select(id => all.FirstOrDefault(d => d.Id == id)).Where(d => d is not null).Select(d => d!).ToList();
    }

    protected override Task OnAppearAsync(WillAppearEvent e)
    {
        Migrate();
        return Task.CompletedTask;
    }

    protected override void OnSettingsApplied() => Migrate();

    private void Migrate()
    {
        if (Settings.MigrateLegacyDevices()) SaveSettings();
    }

    // ---------------------------------------------------------------- key

    protected override async Task OnKeyPressAsync(KeyUpEvent e)
    {
        if (Engine is not { IsAvailable: true } engine || !engine.CanSetDefault)
        {
            ShowAlert();
            Render();
            return;
        }
        AudioDevice? target;
        if (IsSetMode)
        {
            var id = Configured.FirstOrDefault();
            target = id is null ? null : engine.GetDevice(id);
        }
        else
        {
            var list = CycleList();
            var i = list.FindIndex(d => d.Id == CurrentDefault);
            target = list.Count == 0 ? null : list[(i + 1) % list.Count];
        }
        if (target is null)
        {
            ShowAlert();
            Render();
            return;
        }
        if (target.Id == CurrentDefault)
        {
            ShowOk();
            Render();
            return;
        }
        await SwitchAsync(target).ConfigureAwait(false);
    }

    private async Task SwitchAsync(AudioDevice target)
    {
        try
        {
            await Engine!.SetDefaultAsync(target.Id, Roles).ConfigureAwait(false);
            if (IsKey) ShowOk();
        }
        catch (Exception ex)
        {
            Log.Warn($"{ActionUuid}: switching the default device failed: {ex.Message}");
            ShowAlert();
        }
        Render();
    }

    // ---------------------------------------------------------------- dial

    protected override Task OnDialRotateAsync(DialRotateEvent e)
    {
        var all = Engine?.GetDevices(Flow) ?? [];
        if (all.Count > 0)
        {
            var i = CursorIndex(all);
            i = Math.Clamp(i + ListStep(e.Ticks), 0, all.Count - 1);
            _cursorId = all[i].Id;
            RestartCursorTimer();
        }
        Render();
        SettleLater();
        return Task.CompletedTask;
    }

    protected override async Task OnDialPressAsync(DialUpEvent e)
    {
        var all = Engine?.GetDevices(Flow) ?? [];
        if (Engine is not { IsAvailable: true, CanSetDefault: true } || all.Count == 0)
        {
            ShowAlert();
            Render();
            return;
        }
        var target = all[CursorIndex(all)];
        _cursorId = target.Id;
        RestartCursorTimer();
        if (target.Id != CurrentDefault) await SwitchAsync(target).ConfigureAwait(false);
        else Render();
        SettleLater();
    }

    protected override Task OnTouchTapAsync(TouchTapEvent e) => OnDialPressAsync(new DialUpEvent(e.Context, e.ActionUuid, e.DeviceId, e.Coordinates));

    private int CursorIndex(IReadOnlyList<AudioDevice> all)
    {
        var id = _cursorId ?? CurrentDefault;
        var i = all.ToList().FindIndex(d => d.Id == id);
        return i < 0 ? 0 : i;
    }

    private void RestartCursorTimer()
    {
        _cursorTimer?.Dispose();
        _cursorTimer = Time.CreateTimer(_ => Post(() =>
        {
            _cursorId = null;
            Render();
        }), null, CursorReset, Timeout.InfiniteTimeSpan);
    }

    // ---------------------------------------------------------------- render

    protected override void Render()
    {
        var view = View();
        if (IsDial) ShowDial(view, AudioArt.DeviceDial(Theme, view, IsInteractive));
        else ShowKey(view, AudioArt.DeviceKey(Theme, view));
    }

    internal DeviceView View()
    {
        var output = Flow == AudioFlow.Render;
        if (Engine is not { IsAvailable: true } engine) return new DeviceView(output, "NO AUDIO", null, false, false, 0, 0, Unavailable: true);
        var current = CurrentDefault;
        if (IsDial)
        {
            var all = engine.GetDevices(Flow);
            if (all.Count == 0) return new DeviceView(output, "NO DEVICES", null, false, false, 0, 0, Unavailable: true);
            var i = CursorIndex(all);
            var d = all[i];
            var isDefault = d.Id == current;
            var hint = !engine.CanSetDefault ? "UNAVAILABLE" : isDefault ? null : "PUSH TO SET";
            return new DeviceView(output, d.Title, d.Subtitle, isDefault, isDefault, i, all.Count, hint);
        }
        if (IsSetMode)
        {
            var id = Configured.FirstOrDefault();
            var target = id is null ? null : engine.GetDevice(id);
            if (target is null) return new DeviceView(output, id is null ? "PICK A DEVICE" : "NOT CONNECTED", null, false, false, 0, 0, Unavailable: true);
            return new DeviceView(output, target.Title, target.Subtitle, target.Id == current, target.Id == current, 0, 1);
        }
        var cur = current is null ? null : engine.GetDevice(current);
        if (cur is null) return new DeviceView(output, "NO DEVICE", null, false, false, 0, 0, Unavailable: true);
        var list = CycleList();
        var idx = list.FindIndex(d => d.Id == cur.Id);
        // Position dots only for a short, user-chosen list.
        var chosen = Configured.Count > 0;
        return new DeviceView(output, cur.Title, cur.Subtitle, false, true, Math.Max(0, idx), chosen ? list.Count : 0);
    }

    protected override void DisposeCore()
    {
        _cursorTimer?.Dispose();
        _cursorTimer = null;
    }

    // ---------------------------------------------------------------- property inspector

    protected override Task<object?> OnAudioPiMessageAsync(string type, JsonNode? data) => Task.FromResult<object?>(type switch
    {
        "audio.switch.devices" => WithMissing(DeviceChoices(), [.. Configured]),
        _ => null,
    });

    /// <summary>The checklist: every active device of this flow (a chosen one that is unplugged is kept by <see cref="AudioActionBase{T}.WithMissing"/>).</summary>
    private List<PiOption> DeviceChoices() =>
        Engine is null ? [] : Engine.GetDevices(Flow).Select(d => new PiOption(d.Id, d.FriendlyName)).ToList();

    /// <summary>The position dots on a key show up to this many devices.</summary>
    internal const int MaxDevices = 8;

    protected override PiForm? DescribeForm() => new PiForm()
        .Heading(Flow == AudioFlow.Render ? "Output devices" : "Input devices")
        .Select("mode", "Key press", [("cycle", "Cycle through the checked devices"), ("set", "Set the first checked device")])
        .MultiSelect("devices", "Devices", optionsFrom: "audio.switch.devices", ordered: true, max: MaxDevices)
        .Select("roles", "Switch", [("all", "Default + communications"), ("default", "Default device only"), ("communications", "Communications only")])
        .Info("Tip", "Check the devices to cycle through and put them in order. With none checked, the key cycles through all of them. On a dial: turn to browse, push to switch.")
        .Info("Now", stateKey: "status");

    protected override object? DescribeState()
    {
        var id = CurrentDefault;
        var d = id is null ? null : Engine?.GetDevice(id);
        var canSwitch = Engine?.CanSetDefault == true;
        return new { status = (d is null ? "No default device" : "Default: " + d.FriendlyName) + (canSwitch ? "" : " (switching unavailable)") };
    }
}

[StreamDeckAction("com.jeremyfhall.prismcontrol.audio.output-device", Name = "Output Device",
    Icon = "imgs/actions/audio/output-device/icon", KeyImage = "imgs/actions/audio/output-device/key", EncoderIcon = "imgs/actions/audio/output-device/dial",
    Controllers = Controllers.Keypad | Controllers.Encoder,
    Tooltip = "Switch the default output: press to cycle through your devices, or turn a dial to browse and push to set.",
    Layout = Layouts.Canvas.Path, TriggerRotate = "Browse outputs", TriggerPush = "Set default", TriggerTouch = "Set default")]
public sealed class OutputDeviceAction : DeviceSwitchAction
{
    protected override AudioFlow Flow => AudioFlow.Render;
}

[StreamDeckAction("com.jeremyfhall.prismcontrol.audio.input-device", Name = "Input Device",
    Icon = "imgs/actions/audio/input-device/icon", KeyImage = "imgs/actions/audio/input-device/key", EncoderIcon = "imgs/actions/audio/input-device/dial",
    Controllers = Controllers.Keypad | Controllers.Encoder,
    Tooltip = "Switch the default microphone: press to cycle through your devices, or turn a dial to browse and push to set.",
    Layout = Layouts.Canvas.Path, TriggerRotate = "Browse inputs", TriggerPush = "Set default", TriggerTouch = "Set default")]
public sealed class InputDeviceAction : DeviceSwitchAction
{
    protected override AudioFlow Flow => AudioFlow.Capture;
}
