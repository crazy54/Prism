using PrismControl.Core.Hosting;
using PrismControl.Desktop;
using PrismControl.Desktop.Sight;
using PrismControl.Sight.Calibration;
using PrismControl.Sight.Capture;
using PrismControl.Sight.Control;
using PrismControl.Sight.GameLink;
using PrismControl.Sight.Recipes;
using PrismControl.Sight.Safety;
using PrismControl.Sight.Service;
using PrismControl.Sight.Text;

[assembly: PrismModule(typeof(PrismControl.Sight.SightModule),
    MonitorApplications = ["PlanetCoaster2.exe", "PlanetCoaster.exe", "NMS.exe", "factorio.exe", "FactoryGame-Win64-Shipping.exe", "FactoryGameSteam-Win64-Shipping.exe"])]

namespace PrismControl.Sight;

/// <summary>
/// Prism Sight ("sight"): screen reading for allowlisted offline games. Registers <see cref="ISightService"/> (read side,
/// for the Smart Deck engine) and <see cref="ISightControl"/> (gesture-driven act side) in ctx.Services, forwards state to
/// Prism Deck's Game Link listener, and hosts the calibration recorder. Composition root: the ONLY place that touches
/// the desktop input senders, and it hands them to <see cref="SightControl"/> alone. Safe mode: capture still reads (a
/// read), keystrokes and clicks go to the recording fakes, Game Link posts and calibration files are never written.
/// </summary>
public sealed class SightModule : IPrismModule, IAsyncDisposable
{
    private SightService? _service;
    private SightControl? _control;
    private GameLinkForwarder? _forwarder;
    private WindowsOcrRecognizer? _ocr;

    public string Name => "sight";

    public void Initialize(IModuleContext context)
    {
        var log = context.Log.For("sight");
        var safe = context.SafeMode;
        DesktopServices? desk = null;
        try { desk = DesktopServices.GetOrCreate(context); }
        catch (Exception ex) { log.Error("Desktop services unavailable: Sight reads, but cannot act", ex); }

        SightSettings settings;
        try { settings = context.GlobalSettings.GetSection<SightSettings>(SightSettings.Section); }
        catch (Exception) { settings = new SightSettings(); }

        var recipes = LoadRecipes(context, log);
        var user = new UserGames(safe ? null : Path.Combine(context.DataDirectory, "games.json"), log);
        var policy = new GamePolicy(user, time: context.Time);
        _ocr = new WindowsOcrRecognizer();
        var guard = new GestureGuard(context.Time);
        var recorder = new CalibrationRecorder(log: log, time: context.Time);
        _service = new SightService(new SightServiceOptions
        {
            Recipes = recipes, Policy = policy, Ocr = _ocr, Log = log, Time = context.Time, SafeMode = safe, Settings = settings,
            Recorder = recorder, Guard = guard,
        });
        IInputSender input = desk?.Input ?? new RecordingInputSender(log);
        IMouseSender? mouse = desk?.Mouse;
        _control = new SightControl(_service, input, mouse, guard, safe || desk is null, log, context.Time);
        _service.CountedSteps = _control.Counted;
        _forwarder = new GameLinkForwarder(new GameLinkForwarderOptions { Time = context.Time, Log = log, SafeMode = safe });
        _forwarder.Start(_service);

        context.Services.Add<ISightService>(_service);
        context.Services.Add<ISightControl>(_control);
        context.Services.Add(_service);
        context.Services.Add(_control);
        context.Services.Add(policy);
        context.Services.Add(guard);

        context.GlobalSettings.Changed += (_, _) =>
        {
            try
            {
                var s = context.GlobalSettings.GetSection<SightSettings>(SightSettings.Section);
                settings.Enabled = s.Enabled;
                settings.AllowDraftRecipes = s.AllowDraftRecipes;
                settings.CaptureFormat = s.CaptureFormat;
                settings.Games = s.Games;
            }
            catch (Exception ex) { log.Debug("sight settings unreadable: " + ex.Message); }
        };
        if (safe) log.Info("Safe mode: Sight reads, but keystrokes and clicks are logged, Game Link posts and calibration files are never written.");

        var service = _service;
        _ = Task.Run(async () =>
        {
            if (!WgcRegionCapture.IsSupported()) { log.Warn("Windows.Graphics.Capture is not supported here: Sight is off"); return; }
            await WgcRegionCapture.RequestBorderlessAsync().ConfigureAwait(false);
            service.Start();
        });
    }

    /// <summary>Built-in recipes, then the user's (%APPDATA%\Prism\control\modules\sight\recipes\*.json; same id = override).</summary>
    public static IReadOnlyList<CompiledRecipe> LoadRecipes(IModuleContext context, ILog log)
    {
        var byId = new Dictionary<string, CompiledRecipe>(StringComparer.Ordinal);
        foreach (var (name, json) in RecipeLoader.BuiltinJson())
        {
            try { var r = RecipeLoader.FromJson(json, new EmbeddedAssets(), "builtin:" + name); byId[r.Id] = r; }
            catch (RecipeException ex) { log.Error($"built-in recipe {name} is invalid: {string.Join("; ", ex.Errors)}"); }
        }
        var dir = Path.Combine(context.DataDirectory, "recipes");
        List<string> files;
        // An unreadable folder or file (access denied, a locked or vanished file) skips that recipe; it never stops Sight.
        try { files = Directory.Exists(dir) ? Directory.EnumerateFiles(dir, "*.json").ToList() : []; }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or System.Security.SecurityException)
        {
            log.Warn($"user recipes folder unreadable ({ex.GetType().Name}): built-in recipes only");
            files = [];
        }
        foreach (var file in files)
        {
            try { var r = RecipeLoader.Load(file); byId[r.Id] = r; log.Info($"user recipe {r.Id} loaded"); }
            catch (Exception ex) when (ex is RecipeException or IOException or UnauthorizedAccessException or System.Security.SecurityException or System.Text.Json.JsonException)
            {
                log.Warn($"recipe {Path.GetFileName(file)} skipped: {ex.GetType().Name}: {ex.Message}");
            }
        }
        return byId.Values.ToList();
    }

    public async ValueTask DisposeAsync()
    {
        if (_forwarder is not null) await _forwarder.DisposeAsync().ConfigureAwait(false);
        if (_service is not null) await _service.DisposeAsync().ConfigureAwait(false);
        _control?.Dispose();
        _ocr?.Dispose();
    }
}
