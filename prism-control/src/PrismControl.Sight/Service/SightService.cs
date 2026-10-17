using System.Text;
using System.Threading.Channels;
using PrismControl.Core.Hosting;
using PrismControl.Desktop.Sight;
using PrismControl.Sight.Calibration;
using PrismControl.Sight.Capture;
using PrismControl.Sight.Control;
using PrismControl.Sight.Engine;
using PrismControl.Sight.Imaging;
using PrismControl.Sight.Recipes;
using PrismControl.Sight.Safety;
using PrismControl.Sight.Text;

namespace PrismControl.Sight.Service;

/// <summary>A frame source for one window (WGC in production; synthetic in tests).</summary>
public interface ICaptureSource : IDisposable
{
    void Start();
    /// <summary>Static screen: cut due regions from the cached last frame when WGC was quiet that long.</summary>
    bool PollCached(TimeSpan quietFor);
    bool SetMinUpdateInterval(TimeSpan interval);
    CapturePixelFormat Format { get; }
    double PaperWhite { get; }
    CaptureStats Stats { get; }
    event Action? Closed;
    /// <summary>
    /// True when the display under the window changed since Start (HDR switched on/off, the SDR white level, another
    /// monitor): the format and paper white were fixed at Start, so the session must be restarted. Cheap; rate-limited.
    /// </summary>
    bool DisplayChanged() => false;
}

public delegate ICaptureSource CaptureFactory(nint hwnd, CaptureOptions options, Func<CaptureTickInfo, CropPlan> planner, Action<CapturedFrame> sink);

/// <summary>Global section "sight".</summary>
public sealed class SightSettings
{
    public const string Section = "sight";
    public bool Enabled { get; set; } = true;
    /// <summary>Run recipes still marked "draft" (developers and calibration only).</summary>
    public bool AllowDraftRecipes { get; set; }
    /// <summary>auto | bgra8 | fp16</summary>
    public string CaptureFormat { get; set; } = "auto";
    /// <summary>Per game id: the in-game UI scale and the HDR UI brightness.</summary>
    public Dictionary<string, SightGameSettings> Games { get; set; } = new(StringComparer.Ordinal);
}

public sealed class SightGameSettings
{
    public double? HudScale { get; set; }
    public double? PaperWhiteNits { get; set; }
}

/// <summary>A window's identity for matching (no title: titles are personal data).</summary>
public readonly record struct WindowIdentity(int Pid, string ProcessName, string? ExePath, string WindowClass);

public sealed class SightServiceOptions
{
    public required IReadOnlyList<CompiledRecipe> Recipes { get; init; }
    public required GamePolicy Policy { get; init; }
    public ITextRecognizer? Ocr { get; init; }
    public ILog Log { get; init; } = NullLog.Instance;
    public TimeProvider Time { get; init; } = TimeProvider.System;
    public bool SafeMode { get; init; }
    public SightSettings Settings { get; init; } = new();
    public CalibrationRecorder? Recorder { get; init; }
    public GestureGuard? Guard { get; init; }
    public CaptureFactory? CaptureFactory { get; init; }
    public Func<nint>? Foreground { get; init; }
    public Func<nint, WindowIdentity?>? Identify { get; init; }
    public Func<nint, WindowVisibility>? Visibility { get; init; }
    public TimeSpan TickInterval { get; init; } = TimeSpan.FromMilliseconds(250);
    public TimeSpan MinUpdateInterval { get; init; } = TimeSpan.FromMilliseconds(100);
}

/// <summary>
/// Prism Sight's reader. Every tick it looks at the foreground window; when it is a game with a recipe and the policy
/// allows reading, it becomes the target: a capture session feeds the engine (crops of due regions only). The target is
/// read while its window is visible; minimized, hidden or cloaked = paused (capture stopped, values stale); closed =
/// dropped. Subscribers get snapshots on change and events. Nothing here sends input.
/// </summary>
public sealed class SightService : ISightService, ISightLive, IAsyncDisposable
{
    private readonly SightServiceOptions _o;
    private readonly ILog _log;
    private readonly object _gate = new();
    private readonly List<Subscriber> _subs = [];
    private readonly Channel<Action> _dispatch = Channel.CreateUnbounded<Action>(new UnboundedChannelOptions { SingleReader = true });
    private readonly CancellationTokenSource _stop = new();
    private readonly GestureGuard _guard;
    private Runner? _runner;
    private (string Process, SightGameAccess Access)? _blocked;
    private SightSnapshot _current = SightSnapshot.Empty;
    private string _key = "";
    private long _seq;
    private int _boosts;
    private (nint Hwnd, WindowIdentity? Id) _fgCache;
    private Task? _loop, _dispatcher;

    public SightService(SightServiceOptions options)
    {
        _o = options;
        _log = options.Log.For("sight");
        _guard = options.Guard ?? new GestureGuard(options.Time);
        if (_o.Recorder is { } rec)
            rec.Changed += (on, reason) =>
            {
                Raise(new SightEvent(on ? "recStart" : "recStop", _o.Time.GetUtcNow(), new Dictionary<string, object?> { ["reason"] = on ? null : reason }));
                Publish(force: true);
            };
    }

    public SightSettings Settings => _o.Settings;
    public GamePolicy Policy => _o.Policy;
    public IReadOnlyList<CompiledRecipe> Recipes => _o.Recipes;
    public CalibrationRecorder? Recorder => _o.Recorder;

    /// <summary>Counted steps per control (the control layer's ledger), shown in snapshots.</summary>
    public Func<string, int>? CountedSteps { get; set; }

    public void Start()
    {
        _dispatcher ??= Task.Run(DispatchLoopAsync);
        _loop ??= Task.Run(async () =>
        {
            while (!_stop.IsCancellationRequested)
            {
                try { Tick(); }
                catch (Exception ex) { _log.Warn("tick failed: " + ex.GetType().Name + " " + ex.Message); }
                try { await Task.Delay(_o.TickInterval, _o.Time, _stop.Token).ConfigureAwait(false); }
                catch (OperationCanceledException) { break; }
            }
        });
    }

    // ------------------------------------------------------------------ ISightService

    public SightSnapshot Current { get { lock (_gate) return _current; } }

    public IDisposable Subscribe(Action<SightSnapshot> onSnapshot, Action<SightEvent>? onEvent = null)
    {
        var s = new Subscriber(this, onSnapshot, onEvent);
        lock (_gate) _subs.Add(s);
        var now = Current;
        Enqueue(() => s.Snapshot(now));
        return s;
    }

    public SightGameAccess Access(string processName) => _o.Policy.Evaluate(processName);

    // ------------------------------------------------------------------ ISightLive

    public SightTarget? Target { get { lock (_gate) return _runner?.Target; } }
    public SightEngine? Engine { get { lock (_gate) return _runner?.Engine; } }
    public nint ForegroundWindow() => (_o.Foreground ?? WindowGeometry.Foreground)();

    /// <summary>A target whose capture is running (not paused, not failed): read loops stop at once otherwise.</summary>
    public bool CanRead { get { lock (_gate) return _runner is { Paused: false, Error: null }; } }

    public bool ContentToScreen(double x, double y, out PrismControl.Desktop.PointI screen)
    {
        screen = default;
        var t = Target;
        return t is not null && WindowGeometry.TryContentToScreen(t.Hwnd, x, y, out screen);
    }

    public async Task<bool> FreshAsync(IReadOnlyCollection<int> regions, TimeSpan timeout, CancellationToken ct)
    {
        Runner? r;
        lock (_gate) r = _runner;
        if (r is null || r.Paused) return false;
        var t0 = _o.Time.GetUtcNow();
        r.Engine.RequestNow(regions);
        var sw = System.Diagnostics.Stopwatch.StartNew();
        while (sw.Elapsed < timeout)
        {
            if (regions.All(i => r.Engine.RegionProcessedAt(i) is { } at && at >= t0)) return true;
            var wait = r.Engine.WaitForFrameAsync(TimeSpan.FromMilliseconds(60), ct);
            if (!await wait.ConfigureAwait(false)) r.Capture?.PollCached(TimeSpan.FromMilliseconds(40));
        }
        return regions.All(i => r.Engine.RegionProcessedAt(i) is { } at && at >= t0);
    }

    public IDisposable Boost()
    {
        Runner? r;
        lock (_gate) r = _runner;
        if (Interlocked.Increment(ref _boosts) == 1) r?.Capture?.SetMinUpdateInterval(TimeSpan.FromMilliseconds(16));
        return new Releaser(() =>
        {
            if (Interlocked.Decrement(ref _boosts) == 0)
            {
                Runner? now;
                lock (_gate) now = _runner;
                now?.Capture?.SetMinUpdateInterval(_o.MinUpdateInterval);
            }
        });
    }

    // ------------------------------------------------------------------ calibration

    /// <summary>Starts a calibration capture: an explicit user press (key down/up), never in safe mode, only while reading a game.</summary>
    public bool StartCalibration(GestureToken? gesture, out string reason)
    {
        if (_o.Recorder is null) { reason = "calibration capture is not available"; return false; }
        if (_o.SafeMode) { reason = "safe mode: calibration capture never writes files"; return false; }
        if (!_guard.TryAccept(gesture, GestureUse.Calibrate, out reason)) return false;
        var t = Target;
        if (t is null) { reason = "no game is being read"; return false; }
        return _o.Recorder.Start(t.Recipe.Game, t.Recipe.Id, out reason);
    }

    public void StopCalibration(string reason = "stopped by you") => _o.Recorder?.Stop(reason);

    // ------------------------------------------------------------------ the loop

    /// <summary>One pass of target selection, health checks and publishing (the loop calls it; tests call it directly).</summary>
    public void Tick()
    {
        var now = _o.Time.GetUtcNow();
        if (!_o.Settings.Enabled)
        {
            DropRunner("Sight is off");
            Publish();
            return;
        }
        var fg = ForegroundWindow();
        Runner? current;
        lock (_gate) current = _runner;
        string? competitive = null;
        if (fg != 0 && (current is null || WindowGeometry.RootOf(fg) != WindowGeometry.RootOf(current.Target.Hwnd)))
        {
            var id = IdentifyCached(fg);
            // M10: an online-competitive or anti-cheat-protected game in front pauses ALL capture, even of an allowlisted
            // game still visible behind it.
            if (id is { } any && _o.Policy.Evaluate(any.ProcessName, any.ExePath) is { Verdict: nameof(GameVerdict.Denied) or nameof(GameVerdict.AntiCheat) } hard)
                competitive = $"{any.ProcessName} is in front ({hard.Reason})";
            if (id is { } w)
            {
                var recipe = _o.Recipes.FirstOrDefault(r => r.Matches(w.ProcessName, w.WindowClass) && (!r.IsDraft || _o.Settings.AllowDraftRecipes));
                if (recipe is not null)
                {
                    var access = _o.Policy.Evaluate(w.ProcessName, w.ExePath);
                    if (access.ReadAllowed)
                    {
                        DropRunner("another game came to the front");
                        StartRunner(new SightTarget(fg, w.Pid, w.ProcessName, w.ExePath, w.WindowClass, recipe, access));
                        lock (_gate) _blocked = null;
                    }
                    else
                    {
                        bool changed;
                        lock (_gate)
                        {
                            changed = _blocked?.Process != w.ProcessName;
                            _blocked = (w.ProcessName, access);
                        }
                        if (changed)
                        {
                            _log.Info($"not reading {w.ProcessName}: {access.Reason}");
                            Raise(new SightEvent("blocked", now, new Dictionary<string, object?> { ["process"] = w.ProcessName, ["verdict"] = access.Verdict }));
                        }
                    }
                }
            }
        }

        lock (_gate) current = _runner;
        if (current is not null)
        {
            var vis = (_o.Visibility ?? WindowGeometry.Visibility)(current.Target.Hwnd);
            if (vis == WindowVisibility.Gone || current.Closed)
            {
                DropRunner("the game window closed");
                Publish();
                return;
            }
            // Re-checked every tick (the probes cache their expensive parts): an anti-cheat service started, or the user
            // switched the game off, takes effect within seconds, not ~20 s.
            var access = _o.Policy.Evaluate(current.Target.ProcessName, current.Target.ExePath);
            if (!access.ReadAllowed)
            {
                lock (_gate) _blocked = (current.Target.ProcessName, access);
                DropRunner(access.Reason);
                Publish();
                return;
            }
            if (current.Target.Recipe.IsDraft && !_o.Settings.AllowDraftRecipes)
            {
                DropRunner("draft recipes were switched off");
                Publish();
                return;
            }
            var pauseFor = competitive ?? (vis != WindowVisibility.Visible ? $"window {vis.ToString().ToLowerInvariant()}" : null);
            if (pauseFor is not null)
            {
                if (!current.Paused)
                {
                    current.Pause(pauseFor, now);
                    Raise(new SightEvent("paused", now, new Dictionary<string, object?> { ["reason"] = competitive is null ? vis.ToString().ToLowerInvariant() : "competitive" }));
                    if (_o.Recorder?.IsRecording == true) _o.Recorder.Stop(competitive is null ? "the game window was " + vis.ToString().ToLowerInvariant() : "an online-competitive game is in front");
                }
            }
            else
            {
                if (current.Paused)
                {
                    // M8: a failed start is retried with a backoff, and "resumed" is posted only when it really resumed.
                    if (current.MayRetry(now) && current.Resume(now))
                        Raise(new SightEvent("resumed", now, new Dictionary<string, object?>()));
                }
                else if (current.Capture?.DisplayChanged() == true)
                {
                    // HDR, white level or monitor changed: restart the session so format and paper white follow.
                    _log.Info("the display changed under the game: restarting the capture");
                    current.Pause("the display changed", now);
                    current.Resume(now);
                }
                if (!current.Paused)
                {
                    current.Capture?.PollCached(TimeSpan.FromMilliseconds(150));
                    current.Engine.Tick(now);
                }
            }
        }
        Publish();
    }

    /// <summary>The identity of the window in front, re-read only when another window comes to the front.</summary>
    private WindowIdentity? IdentifyCached(nint hwnd)
    {
        var c = _fgCache;
        if (c.Hwnd == hwnd && hwnd != 0) return c.Id;
        var id = (_o.Identify ?? Identify)(hwnd);
        _fgCache = (hwnd, id);
        return id;
    }

    private static WindowIdentity? Identify(nint hwnd)
    {
        var pid = WindowGeometry.ProcessId(hwnd);
        if (pid <= 0) return null;
        var path = WindowGeometry.ProcessPath(pid);
        var name = path is null ? null : Path.GetFileName(path);
        if (name is null) return null;
        return new WindowIdentity(pid, name, path, WindowGeometry.ClassName(WindowGeometry.RootOf(hwnd)));
    }

    private void StartRunner(SightTarget t)
    {
        var game = _o.Settings.Games.TryGetValue(t.Recipe.Game, out var gs) ? gs : null;
        var engine = new SightEngine(t.Recipe, new SightEngineOptions { Ocr = _o.Ocr, Log = _log, HudScale = game?.HudScale });
        var runner = new Runner(this, t, engine, game?.HudScale ?? t.Recipe.Hud.Scale);
        engine.EventRaised += Raise;
        // A recipe that reads with the default glyph set: build it now, not inside the first push's read budget.
        if (engine.Recipe.Detectors.Any(d => d is Detectors.OcrDetector { Engine: not Detectors.OcrEngineMode.Windows, Glyphs: null })) _ = GlyphSet.WarmDefaultAsync();
        lock (_gate) _runner = runner;
        _log.Info($"reading {t.ProcessName} with recipe {t.Recipe.Id} ({t.Access.Verdict})");
        Raise(new SightEvent("target", _o.Time.GetUtcNow(), new Dictionary<string, object?> { ["game"] = t.Recipe.Game, ["recipe"] = t.Recipe.Id }));
        runner.Resume(_o.Time.GetUtcNow());
    }

    private void DropRunner(string reason)
    {
        Runner? r;
        lock (_gate) { r = _runner; _runner = null; }
        if (r is null) return;
        if (_o.Recorder?.IsRecording == true) _o.Recorder.Stop(reason);
        r.Dispose();
        _log.Info($"stopped reading {r.Target.ProcessName}: {reason}");
        Raise(new SightEvent("paused", _o.Time.GetUtcNow(), new Dictionary<string, object?> { ["reason"] = reason }));
    }

    // ------------------------------------------------------------------ snapshots and events

    private void Publish(bool force = false)
    {
        var now = _o.Time.GetUtcNow();
        Runner? r;
        (string Process, SightGameAccess Access)? blocked;
        lock (_gate) { r = _runner; blocked = _blocked; }
        SightRunState state;
        string? reason = null, game = null, recipe = null, process = null;
        SightContext ctx = SightContext.None;
        IReadOnlyDictionary<string, SightReadout> readouts = new Dictionary<string, SightReadout>();
        IReadOnlyDictionary<string, SightControlState> controls = new Dictionary<string, SightControlState>();
        if (!_o.Settings.Enabled) state = SightRunState.Off;
        else if (r is null)
        {
            state = blocked is null ? SightRunState.Idle : SightRunState.Blocked;
            reason = blocked?.Access.Reason;
            process = blocked?.Process;
        }
        else
        {
            var (c, ro, co, pause) = r.Engine.State();
            state = r.Error is not null ? SightRunState.Error : r.Paused ? SightRunState.Paused : SightRunState.Running;
            reason = r.Error ?? pause;
            ctx = c;
            readouts = ro;
            var counted = CountedSteps;
            controls = counted is null ? co : co.ToDictionary(kv => kv.Key, kv => kv.Value with { CountedSteps = counted(kv.Key) }, StringComparer.Ordinal);
            game = r.Target.Recipe.Game;
            recipe = r.Target.Recipe.Id;
            process = r.Target.ProcessName;
        }
        var recording = _o.Recorder?.IsRecording == true;
        var key = Key(state, game, recipe, ctx, readouts, controls, recording, reason);
        SightSnapshot snap;
        List<Subscriber> subs;
        lock (_gate)
        {
            var changed = key != _key;
            if (!changed && !force)
            {
                // Values unchanged: refresh Current (timestamps) but do not notify.
                _current = _current with { At = now, Readouts = readouts, Controls = controls };
                return;
            }
            _key = key;
            snap = new SightSnapshot(++_seq, now, state, game, recipe, process, ctx, readouts, controls, recording, reason);
            _current = snap;
            subs = [.. _subs];
        }
        foreach (var s in subs) Enqueue(() => s.Snapshot(snap));
    }

    private static string Key(SightRunState state, string? game, string? recipe, SightContext ctx, IReadOnlyDictionary<string, SightReadout> ro,
        IReadOnlyDictionary<string, SightControlState> co, bool rec, string? reason)
    {
        var sb = new StringBuilder();
        sb.Append(state).Append('|').Append(game).Append('|').Append(recipe).Append('|').Append(ctx.Id).Append(ctx.Confidence).Append(string.Join(",", ctx.Active)).Append('|').Append(rec).Append('|').Append(reason);
        foreach (var (k, v) in ro.OrderBy(x => x.Key, StringComparer.Ordinal)) sb.Append('|').Append(k).Append('=').Append(v.Number).Append(v.Text).Append(v.Flag).Append(v.Confidence);
        foreach (var (k, v) in co.OrderBy(x => x.Key, StringComparer.Ordinal)) sb.Append('|').Append(k).Append(v.Located).Append(v.CountedSteps);
        return sb.ToString();
    }

    private void Raise(SightEvent e)
    {
        List<Subscriber> subs;
        lock (_gate) subs = [.. _subs];
        foreach (var s in subs) Enqueue(() => s.Event(e));
    }

    private void Enqueue(Action a) => _dispatch.Writer.TryWrite(a);

    private async Task DispatchLoopAsync()
    {
        await foreach (var a in _dispatch.Reader.ReadAllAsync().ConfigureAwait(false))
        {
            try { a(); }
            catch (Exception ex) { _log.Warn("subscriber threw " + ex.GetType().Name); }
        }
    }

    /// <summary>Frames waiting for the engine (tests settle on 0; DropOldest may also discard, which counts as done).</summary>
    internal int PendingFrames { get { lock (_gate) return _runner?.Pending ?? 0; } }

    /// <summary>Runs queued notifications now (tests without the dispatcher task).</summary>
    internal void DrainForTests()
    {
        while (_dispatch.Reader.TryRead(out var a)) a();
    }

    public async ValueTask DisposeAsync()
    {
        _stop.Cancel();
        DropRunner("shutting down");
        _dispatch.Writer.TryComplete();
        foreach (var t in new[] { _loop, _dispatcher })
            if (t is not null) { try { await t.ConfigureAwait(false); } catch (Exception) { } }
        _stop.Dispose();
    }

    private sealed class Subscriber(SightService owner, Action<SightSnapshot> onSnapshot, Action<SightEvent>? onEvent) : IDisposable
    {
        public void Snapshot(SightSnapshot s) => onSnapshot(s);
        public void Event(SightEvent e) => onEvent?.Invoke(e);
        public void Dispose() { lock (owner._gate) owner._subs.Remove(this); }
    }

    private sealed class Releaser(Action release) : IDisposable
    {
        private int _done;
        public void Dispose() { if (Interlocked.Exchange(ref _done, 1) == 0) release(); }
    }

    // ------------------------------------------------------------------ one target

    private sealed class Runner : IDisposable
    {
        private readonly SightService _svc;
        private readonly Channel<CapturedFrame> _frames = Channel.CreateBounded<CapturedFrame>(new BoundedChannelOptions(2) { FullMode = BoundedChannelFullMode.DropOldest, SingleReader = true });
        private readonly CancellationTokenSource _cts = new();
        private readonly double _hudScale;
        private Task? _consumer;
        private bool _busy;
        private int _failures;
        private DateTimeOffset _retryAt = DateTimeOffset.MinValue;

        /// <summary>Frames queued or being processed (the queue keeps the newest 2; older ones are dropped).</summary>
        public int Pending => _frames.Reader.Count + (Volatile.Read(ref _busy) ? 1 : 0);

        public Runner(SightService svc, SightTarget target, SightEngine engine, double hudScale)
        {
            _svc = svc;
            Target = target;
            Engine = engine;
            _hudScale = hudScale;
            _consumer = Task.Run(ConsumeAsync);
        }

        public SightTarget Target { get; }
        public SightEngine Engine { get; }
        public ICaptureSource? Capture { get; private set; }
        public bool Paused { get; private set; } = true;
        public bool Closed { get; private set; }
        public string? Error { get; private set; }

        /// <summary>After a failed start: not before the backoff (1 s, 2 s, 4 s … 30 s) has passed.</summary>
        public bool MayRetry(DateTimeOffset now) => Error is null || now >= _retryAt;

        /// <summary>Starts a capture session. False (and nothing leaked) when it fails.</summary>
        public bool Resume(DateTimeOffset now)
        {
            ICaptureSource? cap = null;
            try
            {
                var opts = new CaptureOptions
                {
                    Format = _svc._o.Settings.CaptureFormat switch { "bgra8" => CaptureFormatPreference.Bgra8, "fp16" => CaptureFormatPreference.Fp16, _ => CaptureFormatPreference.Auto },
                    MinUpdateInterval = _svc._o.MinUpdateInterval,
                    PaperWhiteNits = _svc._o.Settings.Games.TryGetValue(Target.Recipe.Game, out var gs) && gs.PaperWhiteNits is { } pw ? pw : Target.Recipe.PaperWhiteNits,
                };
                var factory = _svc._o.CaptureFactory ?? ((h, o, p, s) => new WgcRegionCapture(h, o, p, s, _svc._log, _svc._o.Time));
                cap = factory(Target.Hwnd, opts, Plan, f => _frames.Writer.TryWrite(f));
                cap.Closed += () => Closed = true;
                cap.Start();
                Capture = cap;
                Paused = false;
                Error = null;
                _failures = 0;
                Engine.SetPaused(false, null, now);
                return true;
            }
            catch (Exception ex)
            {
                // M8: the half-started session (D3D device, context, WinRT wrapper) is released at once, and the next try
                // waits: 1 s, 2 s, 4 s … at most 30 s.
                try { cap?.Dispose(); } catch (Exception) { }
                Capture = null;
                Paused = true;
                _failures++;
                _retryAt = now + TimeSpan.FromSeconds(Math.Min(30, Math.Pow(2, Math.Min(_failures - 1, 5))));
                Error = ex is SightCaptureUnavailableException u ? u.Message : $"capture failed ({ex.GetType().Name} 0x{ex.HResult:X8})";
                if (_failures <= 3 || _failures % 10 == 0) _svc._log.Warn($"{Error} (attempt {_failures}; next try in {(_retryAt - now).TotalSeconds:0} s)");
                Engine.SetPaused(true, Error, now);
                return false;
            }
        }

        public void Pause(string reason, DateTimeOffset now)
        {
            Paused = true;
            var c = Capture;
            Capture = null;
            c?.Dispose();
            Engine.SetPaused(true, reason, now);
        }

        private CropPlan Plan(CaptureTickInfo tick)
        {
            var crops = Engine.Plan(tick.ContentWidth, tick.ContentHeight, tick.At);
            var rec = _svc._o.Recorder;
            var full = rec is not null && rec.Due(tick.At);
            return new CropPlan
            {
                Regions = crops, FullFrame = full,
                WhiteReferenceRegion = Target.Recipe.WhiteReferenceRegion, WhiteReferenceLevel = Target.Recipe.WhiteReferenceLevel,
            };
        }

        private async Task ConsumeAsync()
        {
            try
            {
                await foreach (var f in _frames.Reader.ReadAllAsync(_cts.Token).ConfigureAwait(false))
                {
                    Volatile.Write(ref _busy, true);
                    try
                    {
                        if (f.Regions.Count > 0)
                            await Engine.ProcessAsync(new RegionFrame { At = f.At, ContentWidth = f.ContentWidth, ContentHeight = f.ContentHeight, Regions = f.Regions }, _cts.Token).ConfigureAwait(false);
                        if (f.Full is not null && _svc._o.Recorder is { IsRecording: true } rec) rec.Write(f, Target.Recipe, _svc.Current, _hudScale);
                        _svc.Publish();
                    }
                    catch (OperationCanceledException) when (_cts.IsCancellationRequested) { throw; }
                    catch (Exception ex) { _svc._log.Warn("frame skipped: " + ex.GetType().Name + " " + ex.Message); }   // one bad frame never stops Sight
                    finally { Volatile.Write(ref _busy, false); }
                }
            }
            catch (OperationCanceledException) { }
        }

        public void Dispose()
        {
            _cts.Cancel();
            Capture?.Dispose();
            Capture = null;
            _frames.Writer.TryComplete();
        }
    }
}
