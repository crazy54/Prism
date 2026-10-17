using System.Text.Json.Nodes;
using PrismControl.Core.Actions;
using PrismControl.Core.Hosting;
using PrismControl.Core.PropertyInspector;
using PrismControl.Eq.Sonar;

namespace PrismControl.Eq;

public sealed class EqPresetKeySettings : EqActionSettings
{
    /// <summary>Sonar config id, or an APO preset id ("builtin:…" / "user:…").</summary>
    public string PresetId { get; set; } = "";
    /// <summary>The preset's name when it was picked (shown while offline, and when it has been deleted).</summary>
    public string PresetName { get; set; } = "";
    /// <summary>APO only: the name for "Save current EQ as a preset".</summary>
    public string NewPresetName { get; set; } = "";
    /// <summary>
    /// APO only: a path to an AutoEQ / REW ParametricEQ.txt to import. Transient: cleared after every import attempt
    /// and when the PI closes, because settings travel with exported profiles and a path can hold the user's name.
    /// </summary>
    public string ImportPath { get; set; } = "";
}

/// <summary>
/// Applies one preset to one channel. Press: select it (Sonar <c>PUT /configs/{id}/select</c>; APO copies the
/// preset's bands). The key lights while that preset is the channel's active one, and shows its curve. If the preset
/// was deleted, the key says so (and a press does nothing but alert). While Sonar is failing the key keeps its last
/// state, marked "SONAR ERROR", and a press only alerts.
/// </summary>
[StreamDeckAction("com.jeremyfhall.prismcontrol.eq.preset", Name = "EQ Preset",
    Icon = "imgs/actions/eq/preset/icon", KeyImage = "imgs/actions/eq/preset/key",
    Controllers = Controllers.Keypad,
    Tooltip = "Press to apply an EQ preset to a channel. The key lights while that preset is active.")]
public sealed class EqPresetKey : KeyAction<EqPresetKeySettings>
{
    private EqService? _svc;
    private EqLink? _link;
    private EqChannel? _channel;
    private EqState? _state;
    private EqAvailability? _problem;
    private bool _missing;
    private string? _lastPresetId;
    private CancellationTokenSource _cts = new();
    private readonly EqPiSync _pi = new();

    internal EqAvailability? Problem => _problem;
    public bool IsMissing => _missing;
    public bool IsActive => _state?.ActivePreset?.Id is { } id && id == Settings.PresetId && Settings.PresetId.Length > 0;

    protected override async Task OnWillAppearAsync(WillAppearEvent e)
    {
        if (_cts.IsCancellationRequested) _cts = new CancellationTokenSource();
        _svc = Services.TryGet<EqService>(out var found) ? found : null;
        if (_svc is null)
        {
            _problem = new EqAvailability(EqAvailabilityCode.Error, "The EQ module didn't start.");
            Render();
            return;
        }
        _lastPresetId = Settings.PresetId;
        _link ??= new EqLink(this, _svc, OnChangedAsync, () => ReloadAsync(TimeSpan.Zero, checkPreset: true));
        await ReloadAsync(TimeSpan.FromSeconds(2), checkPreset: true);
    }

    protected override Task OnWillDisappearAsync(WillDisappearEvent e)
    {
        _link?.Dispose();
        _link = null;
        _cts.Cancel();
        ForgetImportPath();
        return Task.CompletedTask;
    }

    protected override async Task OnKeyPressAsync(KeyUpEvent e)
    {
        if (_svc is null) { ShowAlert(); return; }
        if (Settings.PresetId.Length == 0) { ShowAlert(); return; }
        if (_channel is null || _problem is not null) await ReloadAsync(TimeSpan.Zero, checkPreset: false);
        if (_channel is null || _problem is not null) { ShowAlert(); Render(); return; }
        try
        {
            _state = await _svc.Backend.SelectPresetAsync(_channel.Id, Settings.PresetId, _cts.Token);
            _missing = false;
            ShowOk();
        }
        catch (EqPresetMissingException)
        {
            _missing = true;
            ShowAlert();
        }
        catch (EqUnavailableException ex)
        {
            _problem = ex.Availability;
            ShowAlert();
        }
        catch (SonarHttpException ex)
        {
            Log.Warn($"EQ preset select refused: {ex.Message}");
            ShowAlert();
        }
        Render();
    }

    private async Task ReloadAsync(TimeSpan maxAge, bool checkPreset)
    {
        if (_svc is null) return;
        try
        {
            _channel = await _svc.ResolveChannelAsync(Settings.Channel, _cts.Token);
            if (_channel is null)
            {
                _problem = _svc.Backend.Availability.Available ? new EqAvailability(EqAvailabilityCode.NoDevices, "No EQ channel is available.") : _svc.Backend.Availability;
                _state = null;
            }
            else
            {
                _state = await _svc.Backend.GetStateAsync(_channel.Id, maxAge, _cts.Token);
                _problem = null;
                if (checkPreset && Settings.PresetId.Length > 0)
                {
                    var presets = await _svc.Backend.GetPresetsAsync(_channel.Id, TimeSpan.FromSeconds(30), _cts.Token);
                    var p = presets.FirstOrDefault(x => x.Id == Settings.PresetId);
                    _missing = p is null && !IsActive;
                    if (p is not null && p.Name != Settings.PresetName)
                    {
                        Settings.PresetName = p.Name; // renamed in Sonar
                        SaveSettings();
                    }
                }
            }
        }
        catch (EqUnavailableException ex) { _problem = ex.Availability; } // keeps the last good state for a passing Sonar error
        catch (OperationCanceledException) when (_cts.IsCancellationRequested) { return; }
        Render();
        SyncPi();
    }

    private async Task OnChangedAsync(EqChangedEventArgs e)
    {
        if (_channel is null || !string.Equals(e.ChannelId, _channel.Id, StringComparison.OrdinalIgnoreCase)) return;
        if (e.State is { } s)
        {
            var presetSwitched = _state?.ActivePreset?.Id != s.ActivePreset?.Id;
            if (_state is not null && s.Version <= _state.Version) return;
            _state = s;
            _problem = null;
            // A preset switch made elsewhere is a good moment to re-check that ours still exists (cached 30 s).
            if (presetSwitched && e.External) { await ReloadAsync(TimeSpan.FromSeconds(5), checkPreset: true); return; }
            Render();
        }
        else await ReloadAsync(TimeSpan.FromSeconds(5), checkPreset: false);
    }

    private void Render()
    {
        var channel = _channel?.ShortName ?? "EQ";
        var name = Settings.PresetName.Length > 0 ? Settings.PresetName : Settings.PresetId.Length > 0 ? "Preset" : "Choose a preset";
        if (_problem is not null)
        {
            // A passing Sonar error keeps the key's last state (lit if the preset was active), marked.
            var keep = _problem.IsTransient && _state is not null && _channel is not null && string.Equals(_state.ChannelId, _channel.Id, StringComparison.OrdinalIgnoreCase);
            SetImage(EqArt.PresetKey(Theme, channel, name, keep && IsActive, keep ? _state : null, _problem.ShortText));
            return;
        }
        if (_missing)
        {
            SetImage(EqArt.PresetKey(Theme, channel, name, false, null, "DELETED", statusIsError: true));
            return;
        }
        SetImage(EqArt.PresetKey(Theme, channel, name, IsActive, _state));
    }

    /// <summary>Drops a typed import path from the settings (they travel with exported profiles; a path can hold the user's name).</summary>
    private void ForgetImportPath()
    {
        if (Settings.ImportPath.Length == 0) return;
        Settings.ImportPath = "";
        SaveSettings();
    }

    // ------------------------------------------------------------------ property inspector

    /// <summary>Keeps an open PI current (Core's refresh API): the form on a backend switch, the preset list on a channel change, else the status.</summary>
    private void SyncPi() => _pi.Sync(this, _svc, Settings.Channel, DescribeState(), "eq.presets");

    protected override PiForm? DescribeForm()
    {
        var f = EqPi.Head(new PiForm()).Select("presetId", "Preset", optionsFrom: "eq.presets");
        if (_svc?.BackendId == EqService.Apo)
        {
            f.Heading("Your presets (Equalizer APO)")
             .Text("newPresetName", "New preset name", "My preset")
             .Button("eq.apo.savePreset", "Save the channel's current EQ as a preset")
             .Text("importPath", "ParametricEQ.txt", @"C:\Users\you\Downloads\ParametricEQ.txt")
             .Button("eq.apo.import", "Import it as a preset (AutoEQ / REW)");
        }
        else f.Info("Presets", "Favorites (★) come first, in Sonar's order. Presets you make in Sonar show up here.");
        return EqPi.Tail(f, _svc);
    }

    protected override object? DescribeState() => new
    {
        status = EqPi.Status(_svc, _problem, _missing ? $"The preset “{Settings.PresetName}” no longer exists; pick another." : IsActive ? "This preset is active." : null),
    };

    protected override Task OnPropertyInspectorAppearedAsync()
    {
        _pi.Opened(_svc, Settings.Channel);
        _svc?.PollSoon();
        return Task.CompletedTask;
    }

    protected override Task OnPropertyInspectorDisappearedAsync()
    {
        ForgetImportPath();
        return Task.CompletedTask;
    }

    protected override async Task OnSettingsChangedAsync(EqPresetKeySettings settings)
    {
        if (_svc is null) return;
        if (settings.PresetId != _lastPresetId)
        {
            _lastPresetId = settings.PresetId;
            Settings.PresetName = "";
            _missing = false;
            if (await ResolveNameAsync() is { } n) Settings.PresetName = n;
            SaveSettings();
        }
        await ReloadAsync(TimeSpan.FromSeconds(2), checkPreset: true);
    }

    private async Task<string?> ResolveNameAsync()
    {
        if (_svc is null || Settings.PresetId.Length == 0) return null;
        try
        {
            var ch = await _svc.ResolveChannelAsync(Settings.Channel, _cts.Token);
            if (ch is null) return null;
            var presets = await _svc.Backend.GetPresetsAsync(ch.Id, TimeSpan.FromSeconds(10), _cts.Token);
            return presets.FirstOrDefault(p => p.Id == Settings.PresetId)?.Name;
        }
        catch (EqUnavailableException) { return null; }
    }

    protected override async Task<object?> OnPiMessageAsync(string type, JsonNode? data)
    {
        if (_svc is null) return null;
        switch (type)
        {
            case "eq.apo.savePreset" when _svc.ApoBackend is { } apo && _channel is not null && _problem is null:
            {
                var p = apo.SaveUserPreset(_channel.Id, Settings.NewPresetName);
                Settings.PresetId = _lastPresetId = p.Id;
                Settings.PresetName = p.Name;
                Settings.NewPresetName = "";
                SaveSettings();
                await ReloadAsync(TimeSpan.Zero, checkPreset: true);
                RefreshPropertyInspectorOptions("eq.presets");
                return null;
            }
            case "eq.apo.import" when _svc.ApoBackend is { } apo:
                await ImportAsync(apo);
                return null;
        }
        var (handled, result) = await EqPi.HandleAsync(_svc, type, Settings.Channel, _cts.Token);
        if (handled && type.StartsWith("eq.apo.", StringComparison.Ordinal)) await ReloadAsync(TimeSpan.Zero, checkPreset: true);
        return result;
    }

    /// <summary>
    /// Imports the typed ParametricEQ.txt as a plugin-side preset. Whatever happens, the path leaves the settings, and
    /// the status line never repeats it.
    /// </summary>
    private async Task ImportAsync(Apo.ApoEqBackend apo)
    {
        var path = Settings.ImportPath.Trim().Trim('"');
        ForgetImportPath();
        string text;
        try
        {
            if (path.Length == 0) throw new FileNotFoundException();
            if (new FileInfo(path).Length > 1_000_000) throw new InvalidDataException();
            text = await File.ReadAllTextAsync(path, _cts.Token);
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or ArgumentException or NotSupportedException or InvalidDataException)
        {
            SendToPropertyInspector("pi.state", new { status = "Couldn't import: " + ImportProblem(ex) });
            return;
        }
        var name = Settings.NewPresetName.Length > 0 ? Settings.NewPresetName : Path.GetFileNameWithoutExtension(path);
        var p = apo.ImportPreset(name, text);
        if (p is null)
        {
            SendToPropertyInspector("pi.state", new { status = "Couldn't import: no \"Filter N: ON …\" lines found in that file." });
            return;
        }
        Settings.PresetId = _lastPresetId = p.Id;
        Settings.PresetName = p.Name;
        Settings.NewPresetName = "";
        SaveSettings();
        await ReloadAsync(TimeSpan.Zero, checkPreset: true);
        RefreshPropertyInspectorOptions("eq.presets");
    }

    /// <summary>Why a file couldn't be read, without the path (exception messages repeat it).</summary>
    private static string ImportProblem(Exception ex) => ex switch
    {
        FileNotFoundException or DirectoryNotFoundException => "that file doesn't exist. Paste the full path to a ParametricEQ.txt.",
        UnauthorizedAccessException => "Prism Control isn't allowed to read that file.",
        InvalidDataException => "that file is larger than 1 MB; a ParametricEQ.txt is a few lines.",
        ArgumentException or NotSupportedException or PathTooLongException => "that isn't a valid file path.",
        _ => "that file couldn't be read (is it open elsewhere?).",
    };
}
