using PrismControl.Core.Hosting;
using PrismControl.Desktop;
using PrismControl.Smart.Context;
using PrismControl.Smart.Control;
using PrismControl.Smart.Packs;
using PrismControl.Smart.Prefs;
using PrismControl.Smart.Profiles;
using PrismControl.Smart.Providers;
using PrismControl.Smart.Rebinds;
using PrismControl.Smart.Runtime;

[assembly: PrismModule(typeof(PrismControl.Smart.SmartModule), MonitorApplications = [])]

namespace PrismControl.Smart;

/// <summary>
/// The "smart" module: loads packs (shipped + %APPDATA%\Prism\control\packs\ overrides), reads the user's own binds
/// (read-only), and runs the Smart Deck engine behind the Smart Key / Smart Dial actions. Safe mode needs nothing extra
/// here: Desktop already swaps the input/mouse senders for recording fakes, and Sight's act side checks it too.
/// </summary>
public sealed class SmartModule : IPrismModule, IAsyncDisposable
{
    private PackLibrary? _library;
    private RebindService? _rebinds;
    private SmartEngine? _engine;
    private SightBridge? _sight;
    private DesktopForegroundSource? _foreground;
    private FileSystemWatcher? _userPacks;
    private Timer? _reloadDebounce;
    private volatile IReadOnlyList<ContextPack> _effective = [];
    private ILog _log = NullLog.Instance;
    // SD2: the one-profile wizard and the AI preferences channel.
    private PairingService? _pairing;
    private ChangeLog? _changes;
    private SmartControlChannel? _channel;
    private volatile bool _allowAi;
    // B5: the plugin is the only writer of the "smart" section (the PI asks it with smart.prefs.set); each write carries a
    // revision, and a stale copy coming back from the Stream Deck app is not applied but overwritten.
    private readonly object _revGate = new();
    private long _prefsRev;
    private bool _lastAllowAiReceived;

    public string Name => "smart";

    public static string UserPackDirectory => Path.Combine(DesktopPaths.UserDirectory, "packs");

    public void Initialize(IModuleContext ctx)
    {
        _log = ctx.Log.For("smart");
        var desk = DesktopServices.GetOrCreate(ctx);
        var registry = VerbRegistry.GetOrCreate(ctx.Services);
        var pluginPacks = Path.Combine(ctx.PluginDirectory, "packs");
        Func<IEnumerable<PackSourceFile>> sources = () => PackLibrary.Embedded()
            .Concat(PackLibrary.Folder(pluginPacks, PackOrigin.Plugin, _log))
            .Concat(PackLibrary.Folder(UserPackDirectory, PackOrigin.User, _log));
        _library = new PackLibrary(sources, _log);
        _rebinds = new RebindService(log: _log);
        _sight = new SightBridge(ctx.Services, _log);
        _foreground = new DesktopForegroundSource(desk.Foreground, desk.Windows, _log);

        var prefs = ctx.GlobalSettings.GetSection<SmartPreferences>(SmartPreferences.Section);
        _prefsRev = prefs.Rev;
        _engine = new SmartEngine(new SmartEngineParts
        {
            Packs = () => _effective,
            Foreground = _foreground,
            Sight = _sight,
            Verbs = registry,
            Input = desk.Input,
            Mouse = desk.Mouse,
            Time = ctx.Time,
            Log = ctx.Log,
            Preferences = prefs,
            SavePreferences = p => SavePreferences(ctx, p),
        });
        ctx.Services.Add(_engine);
        ctx.Services.Add(new SmartModuleStatus(_library, _rebinds, () => { _library.Reload(); Rebuild(); }));
        registry.Register(new SmartVerbProvider(_engine));
        // SD2: Prism Sight's own state as readouts (unless the Sight module publishes its own "sight" provider).
        if (!registry.Providers.Any(p => p.Module == "sight")) registry.Register(new SightReadoutProvider(_sight, ctx.Time));

        // SD2: AI preferences over the "smart" pipe (off by default; pairing approved on a physical deck).
        _pairing = new PairingService(ctx.Time);
        _changes = new ChangeLog(Path.Combine(ctx.DataDirectory, "audit.jsonl"), ctx.Time);
        var library = _library;
        var ops = new SmartOps(new SmartOpsParts
        {
            Engine = _engine,
            Library = library,
            Sources = sources,
            Reload = () => { library.Reload(); Rebuild(); },
            UserPackDirectory = UserPackDirectory,
            Pairing = _pairing,
            Log = _changes,
            AllowAi = () => _allowAi,
            Time = ctx.Time,
            SafeMode = ctx.SafeMode,
        });
        _channel = new SmartControlChannel(ops, _pairing, _changes, ctx.Time, DesktopPaths.IngressFile(SmartControlChannel.EndpointName), ctx.Log);
        ctx.Services.Add(_pairing);
        ctx.Services.Add(new SmartPiExtras(new ProfileWizard(ProfileWizard.DefaultOutputDirectory, ctx.SafeMode, ctx.Time), _pairing, _changes, _channel, () => _allowAi, ctx.SafeMode, ops));
        // B2: a hold on a REVIEW key of a physical deck approves the AI proposal (the user's own decision, never the pipe's).
        _engine.ReviewApprover = ops.ApproveReview;
        _lastAllowAiReceived = ctx.GlobalSettings.GetSection<SmartAiSettings>(SmartAiSettings.Section).AllowAi;
        ApplyAiSwitch(_lastAllowAiReceived, ctx.ShutdownToken);

        ctx.GlobalSettings.Changed += (_, e) => OnGlobalSettings(ctx, e);
        _rebinds.Changed += () => Task.Run(Rebuild);
        WatchUserPacks();
        if (ctx.SafeMode) _log.Info("Safe mode: smart keys run through the recording input fakes; nothing is typed or clicked.");

        // Pack loading reads ~200 KB of JSON: off the start-up path.
        _ = Task.Run(() =>
        {
            try
            {
                _library.Reload();
                Rebuild();
            }
            catch (Exception ex) { _log.Error("Loading context packs failed", ex); }
        }, ctx.ShutdownToken);
    }

    /// <summary>
    /// The plugin writes the "smart" section (never "smartai": that is the user's switch, written only by the PI).
    /// Setting a global section re-sends the whole object, so each write gets a new revision (B5).
    /// </summary>
    private void SavePreferences(IModuleContext ctx, SmartPreferences p)
    {
        lock (_revGate)
        {
            p.Rev = ++_prefsRev;
            ctx.GlobalSettings.SetSection(SmartPreferences.Section, p);
        }
    }

    /// <summary>
    /// didReceiveGlobalSettings (and our own writes). Review B5: the Stream Deck app keeps ONE object and every writer sends
    /// all of it. A "smart" section older than our last write is a stale copy (a PI saved another section from an old
    /// copy): it is not applied, and our current section is written back over it. When the user switches "Allow AI
    /// preferences" OFF, the plugin re-sends the fresh object at once, so a plugin write that raced the switch can never
    /// bring the old "on" back.
    /// </summary>
    private void OnGlobalSettings(IModuleContext ctx, GlobalSettingsChangedEventArgs e)
    {
        if (_engine is null) return;
        if (e.FromStreamDeck)
        {
            var incoming = ctx.GlobalSettings.GetSection<SmartPreferences>(SmartPreferences.Section);
            bool stale;
            lock (_revGate)
            {
                stale = incoming.Rev < _prefsRev;
                if (!stale) _prefsRev = incoming.Rev;
            }
            var allow = ctx.GlobalSettings.GetSection<SmartAiSettings>(SmartAiSettings.Section).AllowAi;
            var switchedOff = _lastAllowAiReceived && !allow;
            _lastAllowAiReceived = allow;
            if (stale)
            {
                _log.Info($"Global settings came back with an older Smart Deck section (rev {incoming.Rev} < {_prefsRev}): kept ours and wrote it back.");
                SavePreferences(ctx, _engine.Preferences);
            }
            else
            {
                _engine.UpdatePreferences(incoming);
                if (switchedOff) SavePreferences(ctx, _engine.Preferences);
            }
        }
        // "Allow AI preferences" (global:smartai.allowAi): only the user's PI sets it; the pipe has no operation for it.
        ApplyAiSwitch(ctx.GlobalSettings.GetSection<SmartAiSettings>(SmartAiSettings.Section).AllowAi, ctx.ShutdownToken);
    }

    private void ApplyAiSwitch(bool on, CancellationToken ct)
    {
        if (_channel is null || (on == _allowAi && on == _channel.Running)) return;
        _allowAi = on;
        _ = _channel.SetEnabledAsync(on, ct).ContinueWith(t => _log.Warn("AI preferences channel: " + t.Exception?.GetBaseException().Message), CancellationToken.None,
            TaskContinuationOptions.OnlyOnFaulted, TaskScheduler.Default);
    }

    private void Rebuild()
    {
        if (_library is null || _rebinds is null || _engine is null) return;
        _effective = _rebinds.Apply(_library.Packs);
        _engine.PacksChanged();
    }

    private void WatchUserPacks()
    {
        try
        {
            // Our own per-user folder; we never create it (the user does, to add overrides; the PI has "Reload packs").
            if (!Directory.Exists(UserPackDirectory)) return;
            _userPacks = new FileSystemWatcher(UserPackDirectory, "*.json") { NotifyFilter = NotifyFilters.LastWrite | NotifyFilters.FileName | NotifyFilters.Size };
            FileSystemEventHandler kick = (_, _) => KickReload();
            _userPacks.Changed += kick;
            _userPacks.Created += kick;
            _userPacks.Deleted += kick;
            _userPacks.Renamed += (_, _) => KickReload();
            _userPacks.EnableRaisingEvents = true;
        }
        catch (Exception ex) { _log.Warn("Cannot watch the user pack folder: " + ex.GetType().Name); }
    }

    private void KickReload()
    {
        _reloadDebounce?.Dispose();
        _reloadDebounce = new Timer(_ =>
        {
            try { _library?.Reload(); Rebuild(); }
            catch (Exception ex) { _log.Warn("Reloading packs failed", ex); }
        }, null, 500, Timeout.Infinite);
    }

    public async ValueTask DisposeAsync()
    {
        if (_channel is not null) await _channel.DisposeAsync().ConfigureAwait(false);
        _pairing?.Dispose();
        _reloadDebounce?.Dispose();
        _userPacks?.Dispose();
        _engine?.Dispose();
        _rebinds?.Dispose();
        _sight?.Dispose();
        _foreground?.Dispose();
    }
}

/// <summary>Pack and rebind status for the PI's engine view.</summary>
public sealed class SmartModuleStatus(PackLibrary library, RebindService rebinds, Action reload)
{
    /// <summary>Re-reads every pack and rebind file now.</summary>
    public void Reload() => reload();

    public PackLibrary Library => library;
    public RebindService Rebinds => rebinds;

    public object Describe(SmartEngine engine) => engine.Status(
        library.Status.Select(s => (object)new
        {
            id = s.Id, version = s.Version, loaded = s.Loaded, origin = s.Origin.ToString().ToLowerInvariant(), errors = s.Errors, warnings = s.Warnings,
            files = s.Files, problems = s.Problems.Where(p => p.Severity == ProblemSeverity.Error).Take(5).Select(p => p.ToString()).ToArray(),
        }),
        rebinds.Status.Select(r => (object)new { pack = r.PackId, file = r.DisplayPath, format = r.Format, entries = r.Entries, applied = r.Applied, error = r.Error }));
}

/// <summary>The engine's own verbs and readouts in the registry (lock page, next page, current context), for packs, other modules and SD2's MCP tools.</summary>
internal sealed class SmartVerbProvider(SmartEngine engine) : IVerbProvider
{
    public string Module => "smart";

    public IReadOnlyList<VerbDescriptor> Verbs { get; } =
    [
        new VerbDescriptor { Id = "smart.page.lock", Label = "LOCK", LongLabel = "Lock the deck on this page", Glyph = "lock", Category = "system", Priority = 20, StateReadout = "smart.locked" },
        new VerbDescriptor { Id = "smart.page.next", Label = "MORE", LongLabel = "Next smart page", Glyph = "pages", Category = "nav", Priority = 20 },
    ];

    public IReadOnlyList<ReadoutDescriptor> Readouts { get; } =
    [
        new ReadoutDescriptor { Id = "smart.locked", Label = "LOCKED", Widget = "state" },
        new ReadoutDescriptor { Id = "smart.pack", Label = "APP", Widget = "text" },
        new ReadoutDescriptor { Id = "smart.context", Label = "MODE", Widget = "text" },
    ];

    public event Action? Changed { add { } remove { } }

    public VerbStatus GetStatus(string verbId) => VerbStatus.Ready;

    public bool TryReadReadout(string readoutId, out ReadoutValue value)
    {
        var st = engine.Context.Current;
        value = readoutId switch
        {
            "smart.locked" => new ReadoutValue { State = engine.Context.IsLocked, At = engine.Time.GetUtcNow() },
            "smart.pack" => st.Pack is null ? ReadoutValue.Unknown : new ReadoutValue { Text = st.Pack.Name, At = engine.Time.GetUtcNow() },
            "smart.context" => st.Context is null ? ReadoutValue.Unknown : new ReadoutValue { Text = st.Context.Label, At = engine.Time.GetUtcNow() },
            _ => ReadoutValue.Unknown,
        };
        return readoutId is "smart.locked" or "smart.pack" or "smart.context";
    }

    public Task<VerbResult> InvokeAsync(VerbInvocation invocation, CancellationToken ct = default)
    {
        switch (invocation.VerbId)
        {
            case "smart.page.lock":
                engine.Context.SetLocked(!engine.Context.IsLocked, "smart.page.lock verb");
                return Task.FromResult(VerbResult.Done);
            case "smart.page.next":
                return Task.FromResult(VerbResult.Failed("Use the MORE key of the device you want to page."));
            default:
                return Task.FromResult(VerbResult.Failed("unknown verb"));
        }
    }
}
