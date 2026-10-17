using PrismControl.Audio.Art;
using PrismControl.Core.Actions;
using PrismControl.Core.Layouts;
using PrismControl.Core.PropertyInspector;
using PrismControl.Core.Scheduling;

namespace PrismControl.Audio;

public sealed class LevelMeterSettings
{
    /// <summary>Empty = the default output; "@default-input" etc., or an endpoint id.</summary>
    public string? Source { get; set; }
}

/// <summary>
/// A peak meter (L/R where the device has two channels). The meter and its render loop run only while the
/// action is visible: 10 Hz with signal (30 Hz while a dial is touched), 1 Hz at Background priority in silence.
/// Dial: turn = pick the source (default output, default input, any endpoint), push = reset the peak hold.
/// Key: press = swap default output and default input.
/// </summary>
[StreamDeckAction("com.jeremyfhall.prismcontrol.audio.level-meter", Name = "Level Meter",
    Icon = "imgs/actions/audio/level-meter/icon", KeyImage = "imgs/actions/audio/level-meter/key", EncoderIcon = "imgs/actions/audio/level-meter/dial",
    Controllers = Controllers.Keypad | Controllers.Encoder,
    Tooltip = "A live output or input level meter. Turn a dial to pick the source; press a key to swap output and input.",
    Layout = Layouts.Canvas.Path, TriggerRotate = "Source", TriggerPush = "Reset peak", TriggerTouch = "Reset peak")]
public sealed class LevelMeterAction : AudioActionBase<LevelMeterSettings>
{
    internal static readonly TimeSpan SignalInterval = TimeSpan.FromMilliseconds(100);
    internal static readonly TimeSpan ActiveInterval = TimeSpan.FromMilliseconds(33);
    internal static readonly TimeSpan IdleInterval = TimeSpan.FromSeconds(1);

    private RenderLoop? _loop;
    private MeterBinding? _meter;
    private readonly MeterBallistics _ballistics = new();
    private MeterReading _last = MeterReading.Silent;
    private long _lastTick;

    internal RenderLoop? Loop => _loop;

    protected override bool IsRelevant(AudioChange c) => c.Kind is AudioChangeKind.Defaults or AudioChangeKind.Devices or AudioChangeKind.Availability;

    protected override Task OnAppearAsync(WillAppearEvent e)
    {
        if (Engine is not null)
        {
            _meter = new MeterBinding(Engine);
            _lastTick = Time.GetTimestamp();
            _loop = StartRenderLoop(Tick, SignalInterval, ActiveInterval);
        }
        return Task.CompletedTask;
    }

    private string? SourceId() => Engine is { IsAvailable: true } e ? DeviceRef.Resolve(e, Settings.Source, DeviceRef.DefaultOutput) : null;

    private void Tick()
    {
        if (_meter is null) return;
        var now = Time.GetTimestamp();
        _last = _meter.Read(SourceId());
        _ballistics.Update(_last, Time.GetElapsedTime(_lastTick, now));
        _lastTick = now;
        var idle = _ballistics.IsIdle && !IsInteractive;
        if (_loop is not null) _loop.IdleInterval = idle ? IdleInterval : SignalInterval;
        DefaultPriority = idle ? UpdatePriority.Background : UpdatePriority.Normal;
        Render();
    }

    /// <summary>The sources a dial steps through: the two defaults, then every endpoint.</summary>
    internal List<string> Sources()
    {
        var list = new List<string> { "", DeviceRef.DefaultInput };
        if (Engine is { IsAvailable: true } e)
        {
            list.AddRange(e.GetDevices(AudioFlow.Render).Select(d => d.Id));
            list.AddRange(e.GetDevices(AudioFlow.Capture).Select(d => d.Id));
        }
        return list;
    }

    protected override Task OnDialRotateAsync(DialRotateEvent e)
    {
        var list = Sources();
        var current = string.IsNullOrWhiteSpace(Settings.Source) || Settings.Source == DeviceRef.DefaultOutput ? "" : Settings.Source;
        var i = Math.Max(0, list.IndexOf(current));
        i = ((i + ListStep(e.Ticks)) % list.Count + list.Count) % list.Count;
        Settings.Source = list[i];
        SaveSettings();
        _ballistics.ResetHold();
        _loop?.Invalidate();
        return Task.CompletedTask;
    }

    protected override Task OnDialPressAsync(DialUpEvent e) => ResetHold();
    protected override Task OnTouchTapAsync(TouchTapEvent e) => ResetHold();

    protected override Task OnKeyPressAsync(KeyUpEvent e)
    {
        var input = DeviceRef.FlowOf(Settings.Source) == AudioFlow.Capture;
        if (!DeviceRef.FollowsDefault(Settings.Source)) return ResetHold();
        Settings.Source = input ? "" : DeviceRef.DefaultInput;
        SaveSettings();
        _ballistics.ResetHold();
        _loop?.Invalidate();
        return Task.CompletedTask;
    }

    private Task ResetHold()
    {
        _ballistics.ResetHold();
        _loop?.Invalidate();
        return Task.CompletedTask;
    }

    protected override void Render()
    {
        var view = View();
        if (IsDial) ShowDial(view, AudioArt.MeterDial(Theme, view, IsInteractive));
        else ShowKey(view, AudioArt.MeterKey(Theme, view));
    }

    internal MeterView View()
    {
        var id = SourceId();
        var d = id is null ? null : Engine?.GetDevice(id);
        var output = d?.Flow != AudioFlow.Capture && DeviceRef.FlowOf(Settings.Source) != AudioFlow.Capture;
        if (d is null) return new MeterView(output, Engine is { IsAvailable: true } ? "No device" : "No audio", [0], [0], null, Unavailable: true);
        var levels = _ballistics.Levels.Length > 0 ? _ballistics.Levels : [0f];
        var holds = _ballistics.Holds.Length > 0 ? _ballistics.Holds : [0f];
        // The number follows the peak hold (steady for a moment) rather than every 100 ms sample.
        var hold = holds.Max();
        double? db = hold > 0.001f ? Math.Round(hold * 60 - 60) : null;
        return new MeterView(output, d.Title, [.. levels], [.. holds], db);
    }

    protected override void OnDisappear()
    {
        _loop = null;
        _meter?.Close();
    }

    protected override void DisposeCore() => _meter?.Dispose();

    protected override PiForm? DescribeForm() => new PiForm()
        .Heading("Meter")
        .Select("source", "Source", optionsFrom: "audio.endpoints")
        .Info("Use", "Dial: turn to pick the source, push to reset the peak hold. Key: press to swap output and input.");

    protected override object? DescribeState() => null;
}
