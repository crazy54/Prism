using System.Text.Json;
using System.Text.Json.Nodes;
using PrismControl.Core.Actions;
using PrismControl.Core.Hosting;
using PrismControl.Core.Render;
using PrismControl.Core.Render.Tokens;
using PrismControl.Core.Scheduling;
using PrismControl.SystemInfo.Render;
using PrismControl.SystemInfo.Telemetry;

namespace PrismControl.SystemInfo.Actions;

/// <summary>
/// Base of the stats keys: one lease on the shared <see cref="ITelemetry"/> (so the sampler reads only what is shown),
/// a 1 Hz render loop at Background priority (2 Hz with "fast refresh"), and a press that toggles history/detail.
/// Unchanged frames cost nothing (the scheduler drops identical images).
/// </summary>
public abstract class StatKeyAction<TSettings> : KeyAction<TSettings>, IDisposable where TSettings : class, IStatSettings, new()
{
    private ITelemetryLease? _lease;
    private RenderLoop? _loop;
    private string? _lastPiState;
    private readonly TempSettingsSync _tempSync = new();

    protected ITelemetry? Telemetry { get; private set; }

    /// <summary>The label shown when the telemetry service is missing.</summary>
    protected abstract string UnavailableLabel { get; }
    protected abstract int HueIndex { get; }
    /// <summary>What this key shows right now (may depend on the latest frame, e.g. the GPU vendor).</summary>
    protected abstract TelemetryNeeds Needs(TelemetryFrame? latest);
    protected abstract SvgDocument Draw(RefractionPalette t, TelemetryFrame? frame, TelemetryHistory history);

    private TimeSpan Interval => Settings.FastRefresh ? TelemetryService.FastInterval : TelemetryService.Interval;
    private TelemetryNeeds CurrentNeeds => Needs(Telemetry?.Latest) | (Settings.FastRefresh ? TelemetryNeeds.Fast : TelemetryNeeds.None) | PiNeeds;

    /// <summary>Extra sections while the property inspector is open (so its pickers have data).</summary>
    protected virtual TelemetryNeeds PiNeedsWhenOpen => TelemetryNeeds.None;
    private TelemetryNeeds PiNeeds => IsPropertyInspectorVisible ? PiNeedsWhenOpen : TelemetryNeeds.None;

    protected override Task OnWillAppearAsync(WillAppearEvent e)
    {
        DefaultPriority = UpdatePriority.Background;
        Telemetry = Services.TryGet<ITelemetry>(out var t) ? t : null;
        if (Telemetry is not null && Settings is ICpuTempSettings temp) _tempSync.OnAppear(Telemetry, temp);
        _lease?.Dispose();
        _lease = Telemetry?.Acquire(CurrentNeeds);
        _loop = StartRenderLoop(Render, Interval);
        return Task.CompletedTask;
    }

    protected override Task OnWillDisappearAsync(WillDisappearEvent e)
    {
        Release();
        return Task.CompletedTask;
    }

    /// <summary>A press toggles between the history view and the detail view (saved, so it survives a profile switch).</summary>
    protected override Task OnKeyPressAsync(KeyUpEvent e)
    {
        Settings.View = Views.Toggle(Settings.View);
        SaveSettings();
        Refresh();
        RenderWhenFresh();
        return Task.CompletedTask;
    }

    protected override Task OnSettingsChangedAsync(TSettings settings)
    {
        if (Telemetry is not null && settings is ICpuTempSettings temp) _tempSync.OnSettingsChanged(Telemetry, GlobalSettings, temp);
        Refresh();
        RenderWhenFresh();
        return Task.CompletedTask;
    }

    protected override Task OnPropertyInspectorAppearedAsync()
    {
        // The source may have changed globally since this key appeared (e.g. global settings arrived later): show the current one.
        if (Telemetry is not null && Settings is ICpuTempSettings temp) _tempSync.OnAppear(Telemetry, temp);
        _lease?.Update(CurrentNeeds);
        return Task.CompletedTask;
    }

    protected override Task OnPropertyInspectorDisappearedAsync()
    {
        _lease?.Update(CurrentNeeds);
        return Task.CompletedTask;
    }

    protected override Task<object?> OnPiMessageAsync(string type, JsonNode? data) => PiOptions.AnswerAsync(type, Telemetry, () => _lease?.Update(CurrentNeeds | PiNeedsWhenOpen));

    protected override object? DescribeState() => PiState();

    /// <summary>Live status for the PI (<c>.Info(stateKey)</c> fields).</summary>
    protected virtual object? PiState() => null;

    private void Refresh()
    {
        _lease?.Update(CurrentNeeds);
        if (_loop is not null) _loop.IdleInterval = Interval;
        Render();
    }

    /// <summary>A view that needs new data (per-core, another GPU) gets a second render as soon as the sampler has it.</summary>
    private void RenderWhenFresh()
    {
        if (Telemetry is not { } t) return;
        _ = Task.Run(async () =>
        {
            await t.NextFrameAsync(TimeSpan.FromSeconds(1.5)).ConfigureAwait(false);
            Post(Render);
        });
    }

    protected void Render()
    {
        if (Telemetry is not { } t)
        {
            SetImage(KeyFrames.Unavailable(Theme, UnavailableLabel, HueIndex));
            return;
        }
        _lease?.Update(CurrentNeeds);
        SetImage(Draw(Theme, t.Latest, t.History));
        PushPiState();
    }

    private void PushPiState()
    {
        if (!IsPropertyInspectorVisible || PiState() is not { } state) return;
        var json = JsonSerializer.Serialize(state, state.GetType());
        if (json == _lastPiState) return;
        _lastPiState = json;
        SendToPropertyInspector("pi.state", state);
    }

    private void Release()
    {
        _lease?.Dispose();
        _lease = null;
    }

    public void Dispose()
    {
        Release();
        GC.SuppressFinalize(this);
    }
}

/// <summary>
/// The CPU temperature source is plugin-wide (global section "systeminfo"), but the PI edits per-action settings.
/// On appear the action shows the global value; a PI change (a value different from what the action last had) is
/// written back globally. Stale per-action copies never overwrite the global choice.
/// </summary>
internal sealed class TempSettingsSync
{
    private string? _source;
    private int _port;

    public void OnAppear(ITelemetry telemetry, ICpuTempSettings s)
    {
        _source = TempSources.Name(telemetry.CpuTempSource);
        _port = telemetry.LhmPort;
        s.CpuTempSource = _source;
        s.LhmPort = _port;
    }

    public void OnSettingsChanged(ITelemetry telemetry, IGlobalSettings globals, ICpuTempSettings s)
    {
        var source = TempSources.Name(TempSources.Parse(s.CpuTempSource));
        var port = s.LhmPort is > 0 and < 65536 ? s.LhmPort : 8085;
        if (_source is null || source != _source || port != _port)
        {
            _source = source;
            _port = port;
            telemetry.ConfigureCpuTemp(TempSources.Parse(source), port);
            globals.SetSection(SystemInfoModule.Section, new SystemInfoGlobalSettings { CpuTempSource = source, LhmPort = port });
        }
        s.CpuTempSource = _source;
        s.LhmPort = _port;
    }
}

/// <summary>Answers the PI's option requests (GPU, drive and adapter pickers) from the latest sample.</summary>
internal static class PiOptions
{
    public const string Gpus = "systeminfo.gpus", Drives = "systeminfo.drives", Adapters = "systeminfo.adapters";

    public static async Task<object?> AnswerAsync(string type, ITelemetry? telemetry, Action widenLease)
    {
        if (telemetry is null || type is not (Gpus or Drives or Adapters)) return null;
        var f = telemetry.Latest;
        var missing = type switch
        {
            Gpus => f is null || f.Gpus.Count == 0,
            Drives => f is null || f.Disks.Count == 0,
            _ => f?.Network is null,
        };
        if (missing)
        {
            widenLease();
            for (var i = 0; i < 3 && missing; i++)
            {
                f = await telemetry.NextFrameAsync(TimeSpan.FromSeconds(1)).ConfigureAwait(false);
                missing = type switch
                {
                    Gpus => f is null || f.Gpus.Count == 0,
                    Drives => f is null || f.Disks.Count == 0,
                    _ => f?.Network is null,
                };
            }
        }
        return type switch
        {
            Gpus => GpuOptions(f),
            Drives => DriveOptions(f),
            _ => AdapterOptions(f),
        };
    }

    public static List<object> GpuOptions(TelemetryFrame? f)
    {
        var list = new List<object> { new { value = "", label = "Automatic (first GPU)" } };
        foreach (var g in f?.Gpus ?? [])
        {
            var kind = g.Integrated ? "integrated" : g.Vendor switch { "nvidia" => "NVIDIA", "amd" => "AMD", "intel" => "Intel", _ => "GPU" };
            list.Add(new { value = g.Id, label = $"{DialFrames.ShortGpuName(g.Name) ?? "GPU " + (g.Index + 1)} ({kind})" });
        }
        return list;
    }

    public static List<object> DriveOptions(TelemetryFrame? f)
    {
        var list = new List<object>
        {
            new { value = "", label = $"System drive ({StatViews.SystemDrive})" },
            new { value = "*", label = "All drives" },
        };
        foreach (var d in f?.Disks ?? [])
            list.Add(new { value = d.Name, label = $"{d.Name}{(d.Label is { } l ? " " + l : "")} — {Fmt.GiB(d.FreeGiB).Text} free of {Fmt.GiB(d.TotalGiB).Text}" });
        return list;
    }

    public static List<object> AdapterOptions(TelemetryFrame? f)
    {
        var list = new List<object> { new { value = "", label = "Automatic (the default route)" } };
        foreach (var a in f?.Network?.Adapters ?? [])
            list.Add(new { value = a.Id, label = $"{a.Name}{(a.Description is { Length: > 0 } d && d != a.Name ? " — " + d : "")}{(a.IsDefaultRoute ? " (default route)" : "")}" });
        return list;
    }
}
