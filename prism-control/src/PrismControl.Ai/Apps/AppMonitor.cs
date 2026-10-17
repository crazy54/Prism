using PrismControl.Ai.Sessions;
using PrismControl.Ai.Status;
using PrismControl.Core.Hosting;

namespace PrismControl.Ai.Apps;

/// <summary>
/// One app as the deck shows it. Every value is a Fact:
/// <list type="bullet">
/// <item>Running / Foreground: observed (process table, foreground window), TTL 6 s;</item>
/// <item>VoiceLive: inferred (an active microphone session in the app's process tree; active ≠ talking);</item>
/// <item>Generating: always unknown for chat apps (there is no supported signal, and the deck never guesses);</item>
/// <item>AgentTasks: inferred, Codex tasks hosted in the ChatGPT app / Claude Code sessions in Claude Desktop (from AI1's session table).</item>
/// </list>
/// </summary>
public sealed record AppView(AppDef Def, bool Installed, Fact<bool> Running, Fact<bool> Foreground, Fact<bool> VoiceLive,
    Fact<bool> Generating, Fact<int> AgentTasks, IReadOnlyList<int> Pids)
{
    public bool IsRunning => Running.Value && Running.IsKnown;
    public bool InFront => Foreground.Value && Foreground.IsKnown;
    public bool Voice => VoiceLive.Value && VoiceLive.IsKnown;
}

/// <summary>
/// Watches the AI desktop apps while something shows them (2 s cadence; nothing runs before the first demand). Reads only:
/// a process snapshot, the foreground window, Core Audio capture sessions. Window titles are never read (they are content).
/// </summary>
public sealed class AppMonitor : IDisposable
{
    public static readonly TimeSpan Cadence = TimeSpan.FromSeconds(2);
    public static readonly TimeSpan FactTtl = TimeSpan.FromSeconds(6);
    public static readonly TimeSpan TouchWindow = TimeSpan.FromMinutes(2);

    private readonly IProcessScanner _scanner;
    private readonly IForegroundProbe _foreground;
    private readonly IVoiceProbe _voice;
    private readonly IAppProbe _probe;
    private readonly TimeProvider _time;
    private readonly ILog _log;
    private readonly Func<IReadOnlyList<SessionView>>? _sessions;
    private readonly object _gate = new();
    private Dictionary<string, AppView> _views;
    private string _signature = "";
    private int _leases;
    private DateTimeOffset _touchedUntil;
    private int _ticking;
    private ITimer? _timer;

    public AppMonitor(IProcessScanner scanner, IForegroundProbe foreground, IVoiceProbe voice, IAppProbe probe, TimeProvider time, ILog log,
        Func<IReadOnlyList<SessionView>>? sessions = null)
    {
        _scanner = scanner;
        _foreground = foreground;
        _voice = voice;
        _probe = probe;
        _time = time;
        _log = log;
        _sessions = sessions;
        _views = AppCatalog.Apps.ToDictionary(a => a.Id, a => Unknown(a), StringComparer.OrdinalIgnoreCase);
    }

    public event Action? Changed;

    public Action<Func<Task>> Kicker { get; set; } = work => _ = work();

    public void Start(CancellationToken shutdown)
    {
        _timer = _time.CreateTimer(_ => { if (Demanded) _ = TickAsync(); }, null, Cadence, Cadence);
        shutdown.Register(Dispose);
    }

    public bool Demanded
    {
        get
        {
            if (Volatile.Read(ref _leases) > 0) return true;
            lock (_gate) return _time.GetUtcNow() < _touchedUntil;
        }
    }

    public IDisposable Demand()
    {
        if (Interlocked.Increment(ref _leases) == 1) Kicker(TickAsync);
        return new Lease(this);
    }

    public void Touch()
    {
        bool fresh;
        lock (_gate)
        {
            fresh = _time.GetUtcNow() >= _touchedUntil;
            _touchedUntil = _time.GetUtcNow() + TouchWindow;
        }
        if (fresh) Kicker(TickAsync);
    }

    public AppView Get(string id) { lock (_gate) return _views.TryGetValue(id, out var v) ? v : Unknown(AppCatalog.Find(id) ?? AppCatalog.Apps[0]); }

    public IReadOnlyList<AppView> All() { lock (_gate) return AppCatalog.Apps.Select(a => _views[a.Id]).ToList(); }

    /// <summary>One read of the process table, the foreground window and the capture sessions. Never concurrent.</summary>
    public Task TickAsync()
    {
        if (Interlocked.Exchange(ref _ticking, 1) == 1) return Task.CompletedTask;
        try
        {
            var now = _time.GetUtcNow();
            IReadOnlyList<ProcInfo> procs;
            (int Pid, string Exe) fg;
            IReadOnlySet<int> mics;
            try { procs = _scanner.Scan(); } catch (Exception) { procs = []; }
            try { fg = _foreground.Foreground(); } catch (Exception) { fg = (0, ""); }
            try { mics = _voice.ActiveCapturePids(); } catch (Exception) { mics = new HashSet<int>(); }
            var sessions = _sessions?.Invoke() ?? [];

            var parent = new Dictionary<int, int>();
            var byApp = AppCatalog.Apps.ToDictionary(a => a.Id, _ => new List<int>(), StringComparer.OrdinalIgnoreCase);
            var appOf = new Dictionary<int, string>();
            foreach (var p in procs)
            {
                parent[p.Pid] = p.ParentPid;
                if (AppCatalog.ForImage(p.Exe, p.ImagePath) is { } app)
                {
                    byApp[app.Id].Add(p.Pid);
                    appOf[p.Pid] = app.Id;
                }
            }
            // A microphone session may sit in a helper (msedgewebview2.exe, an audio utility process): walk up to 6 parents.
            var voiceApps = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (var pid in mics)
            {
                var cur = pid;
                for (var i = 0; i < 7 && cur > 0; i++)
                {
                    if (appOf.TryGetValue(cur, out var id)) { voiceApps.Add(id); break; }
                    if (!parent.TryGetValue(cur, out var up) || up == cur) break;
                    cur = up;
                }
            }

            var views = new Dictionary<string, AppView>(StringComparer.OrdinalIgnoreCase);
            foreach (var app in AppCatalog.Apps)
            {
                var pids = byApp[app.Id];
                var running = pids.Count > 0;
                var installed = running || SafeInstalled(app);
                var front = running && fg.Pid != 0 && (pids.Contains(fg.Pid) || app.MatchesImage(fg.Exe, null) && app.NameIsUnique);
                views[app.Id] = new AppView(app, installed,
                    Fact<bool>.Observed(running, FactSource.Process, now, FactTtl),
                    Fact<bool>.Observed(front, FactSource.WinEvent, now, FactTtl),
                    running ? Fact<bool>.Inferred(voiceApps.Contains(app.Id), FactSource.CoreAudio, now, FactTtl) : Fact<bool>.Observed(false, FactSource.Process, now, FactTtl),
                    Fact<bool>.Unknown,
                    Tasks(app, sessions, now),
                    pids);
            }
            var sig = string.Join("|", views.Values.Select(v => $"{v.Def.Id}:{v.Installed}:{v.IsRunning}:{v.InFront}:{v.Voice}:{v.AgentTasks.Value}:{v.AgentTasks.Confidence}"));
            bool changed;
            lock (_gate)
            {
                _views = views;
                changed = sig != _signature;
                _signature = sig;
            }
            if (changed) { try { Changed?.Invoke(); } catch (Exception ex) { _log.Warn("an app listener failed", ex); } }
        }
        finally { Volatile.Write(ref _ticking, 0); }
        return Task.CompletedTask;
    }

    private bool SafeInstalled(AppDef app)
    {
        try { return _probe.IsInstalled(app); } catch (Exception) { return false; }
    }

    /// <summary>Agent tasks hosted inside the app (Codex in ChatGPT, Claude Code in Claude Desktop). Unknown when none is hosted there.</summary>
    private static Fact<int> Tasks(AppDef app, IReadOnlyList<SessionView> sessions, DateTimeOffset now)
    {
        var host = app.Id switch { "chatgpt" => HostKind.ChatGpt, "claude-desktop" => HostKind.ClaudeDesktop, _ => HostKind.Unknown };
        if (host == HostKind.Unknown) return Fact<int>.Unknown;
        var hosted = sessions.Where(s => s.Host.Kind == host && !s.Offline).ToList();
        if (hosted.Count == 0) return Fact<int>.Unknown;
        return Fact<int>.Inferred(hosted.Count(s => s.State.Value == SessionState.Working), FactSource.Hook, now, FactTtl);
    }

    private static AppView Unknown(AppDef a) => new(a, false, Fact<bool>.Unknown, Fact<bool>.Unknown, Fact<bool>.Unknown, Fact<bool>.Unknown, Fact<int>.Unknown, []);

    public void Dispose()
    {
        _timer?.Dispose();
        _timer = null;
    }

    private void Release() => Interlocked.Decrement(ref _leases);

    private sealed class Lease(AppMonitor owner) : IDisposable
    {
        private int _done;
        public void Dispose() { if (Interlocked.Exchange(ref _done, 1) == 0) owner.Release(); }
    }
}
