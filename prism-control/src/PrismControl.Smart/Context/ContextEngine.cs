using PrismControl.Core.Hosting;
using PrismControl.Smart.Packs;

namespace PrismControl.Smart.Context;

/// <summary>What the deck follows right now.</summary>
public sealed record ContextState(ContextPack? Pack, PackContext? Context, ForegroundApp? App, string Reason, DateTimeOffset Since)
{
    public static ContextState None { get; } = new(null, null, null, "no app yet", DateTimeOffset.MinValue);
    public string Key => Pack is null || Context is null ? "" : Pack.Id + "/" + Context.Id;
    public override string ToString() => Pack is null ? "(no pack)" : $"{Pack.Id}/{Context?.Id}";
}

public enum ContextEventKind
{
    /// <summary>The deck switched to a new pack/context.</summary>
    Switched,
    /// <summary>A switch is due but waits: a key is held, a dial is turning, or the page is locked.</summary>
    Deferred,
    Locked,
    Unlocked,
    /// <summary>The same pack/context, rebuilt (packs or rebinds reloaded): layouts regenerate, nothing moves unless the pack changed.</summary>
    Refreshed,
}

/// <summary>One entry of the context event stream (the PI's "why" and the tests read these).</summary>
public sealed record ContextEvent(ContextEventKind Kind, string From, string To, string Reason, DateTimeOffset At)
{
    public override string ToString() => $"{At:HH:mm:ss.fff} {Kind} {From} → {To}: {Reason}";
}

public sealed record ContextOptions
{
    /// <summary>Global debounce for app switches (alt-tabbing through windows must not flicker the deck).</summary>
    public int AppDebounceMs { get; init; } = 150;
    /// <summary>When the app in front has no pack, keep showing the last pack (dimmed "not in front") instead of a blank deck.</summary>
    public bool KeepLastWhenNoMatch { get; init; } = true;
    public int HistorySize { get; init; } = 64;
}

/// <summary>
/// Picks the pack and sub-context the deck shows. Highest-priority matching context wins; a switch commits only after it
/// has held for the context's hysteresis (or the app debounce), never while a slot is held or a dial is turning, and
/// never while the page is locked. Pure logic over injected sources and a TimeProvider, so tests drive it with a manual clock.
/// </summary>
public sealed class ContextEngine : IDisposable
{
    private readonly Func<IReadOnlyList<ContextPack>> _packs;
    private readonly IForegroundSource _foreground;
    private readonly ISmartSight _sight;
    private readonly IFieldSource _fields;
    private readonly TimeProvider _time;
    private readonly Func<string?> _holdReason;
    private readonly ILog _log;
    private readonly object _gate = new();
    private readonly LinkedList<ContextEvent> _history = new();
    private ContextOptions _options;
    private ContextState _current = ContextState.None;
    private Candidate? _pending;
    private string? _deferredKey;
    private bool _locked;
    private ITimer? _timer;
    private bool _disposed;

    private sealed record Candidate(ContextPack Pack, PackContext Context, ForegroundApp? App, string Reason, DateTimeOffset Since)
    {
        public string Key => Pack.Id + "/" + Context.Id;
    }

    /// <param name="holdReason">Null when nothing is held; otherwise why a switch must wait ("key 1,2 held", "dial 0 turning").</param>
    public ContextEngine(Func<IReadOnlyList<ContextPack>> packs, IForegroundSource foreground, ISmartSight sight, IFieldSource fields, TimeProvider time,
        Func<string?>? holdReason = null, ContextOptions? options = null, ILog? log = null)
    {
        _packs = packs;
        _foreground = foreground;
        _sight = sight;
        _fields = fields;
        _time = time;
        _holdReason = holdReason ?? (() => null);
        _options = options ?? new ContextOptions();
        _log = (log ?? NullLog.Instance).For("context");
        _foreground.Changed += OnInputChanged;
        _sight.Changed += OnInputChanged;
        _fields.Changed += OnInputChanged;
    }

    /// <summary>Raised synchronously after each event (outside the engine's lock, on the thread that caused it).</summary>
    public event Action<ContextEvent>? Changed;

    public ContextState Current { get { lock (_gate) return _current; } }
    public bool IsLocked { get { lock (_gate) return _locked; } }

    /// <summary>The switch waiting to commit (for the PI), or null.</summary>
    public string? PendingDescription { get { lock (_gate) return _pending is { } p ? $"{p.Key} ({p.Reason})" : null; } }

    /// <summary>
    /// The pack/context a switch is waiting to commit to (deferred by a held key, or still in its dwell), or null. A
    /// confirm verb checks it when it fires: its chord must not land in the page that is replacing it (review E4).
    /// </summary>
    public (ContextPack Pack, PackContext Context)? PendingTarget { get { lock (_gate) return _pending is { } p ? (p.Pack, p.Context) : null; } }

    public IReadOnlyList<ContextEvent> History { get { lock (_gate) return [.. _history]; } }

    public ContextOptions Options
    {
        get { lock (_gate) return _options; }
        set { lock (_gate) _options = value; Evaluate("options changed"); }
    }

    /// <summary>Whether the context's app is the window really in front (input is only ever sent then).</summary>
    public bool IsAppInFront()
    {
        var app = Current.App;
        return app is not null && _foreground.IsInFront(app);
    }

    public void SetLocked(bool locked, string reason = "lock page")
    {
        ContextEvent? ev;
        lock (_gate)
        {
            if (_locked == locked || _disposed) return;
            _locked = locked;
            ev = Record(locked ? ContextEventKind.Locked : ContextEventKind.Unlocked, _current.ToString(), _current.ToString(), reason);
        }
        Changed?.Invoke(ev);
        if (!locked) Evaluate("unlocked");
    }

    /// <summary>A held key was released or a dial stopped: a deferred switch may commit now.</summary>
    public void NotifyHoldReleased() => Evaluate("slot released");

    /// <summary>Packs or rebinds were reloaded: swap in the new objects (same ids) and re-evaluate.</summary>
    public void RefreshPacks()
    {
        ContextEvent? ev = null;
        lock (_gate)
        {
            if (_current.Pack is { } p)
            {
                var np = _packs().FirstOrDefault(x => x.Id == p.Id);
                if (np is null) _current = ContextState.None with { Reason = $"pack {p.Id} was removed", Since = _time.GetUtcNow() };
                else _current = _current with { Pack = np, Context = np.FindContext(_current.Context!.Id) ?? np.DefaultContext };
                ev = Record(ContextEventKind.Refreshed, _current.ToString(), _current.ToString(), "packs reloaded");
            }
            _pending = null;
        }
        if (ev is not null) Changed?.Invoke(ev);
        Evaluate("packs reloaded");
    }

    private void OnInputChanged() => Evaluate("input changed");

    /// <summary>Re-reads every input and commits a switch when it is due. Cheap; safe from any thread.</summary>
    public void Evaluate(string trigger = "evaluate")
    {
        (_sight as SightBridge)?.Poll();
        // Read the hold state BEFORE taking our lock: the hold source has its own lock (lock order: engine → context, never back).
        var hold = _holdReason();
        var events = new List<ContextEvent>();
        lock (_gate)
        {
            if (_disposed) return;
            var now = _time.GetUtcNow();
            var inputs = new ContextInputs(_foreground.Current, _sight.Current, _fields);
            var cand = Resolve(inputs);
            if (cand is null)
            {
                _pending = null;
                CancelTimer();
                return;
            }
            if (cand.Key == _current.Key)
            {
                // Same pack/context (maybe another window of the same app): follow the window silently.
                if (cand.App is { } a && _current.App?.Hwnd != a.Hwnd) _current = _current with { App = a };
                _pending = null;
                _deferredKey = null;
                CancelTimer();
                return;
            }
            if (_pending is null || _pending.Key != cand.Key) _pending = cand with { Since = now };
            else _pending = _pending with { App = cand.App, Reason = cand.Reason };

            var dwell = Dwell(_pending);
            var due = _pending.Since + TimeSpan.FromMilliseconds(dwell);
            if (now < due)
            {
                Arm(due - now);
                return;
            }
            if (hold is not null || _locked)
            {
                var why = _locked ? "page locked" : hold!;
                if (_deferredKey != _pending.Key + "|" + why)
                {
                    _deferredKey = _pending.Key + "|" + why;
                    events.Add(Record(ContextEventKind.Deferred, _current.ToString(), _pending.Key, $"{_pending.Reason}; waiting: {why}"));
                }
                CancelTimer();
            }
            else
            {
                var from = _current.ToString();
                var reason = _pending.Reason + (dwell > 0 ? $" (held {dwell} ms)" : "");
                _current = new ContextState(_pending.Pack, _pending.Context, _pending.App, reason, now);
                events.Add(Record(ContextEventKind.Switched, from, _current.ToString(), reason));
                _log.Debug($"context {from} → {_current} ({trigger})");
                _pending = null;
                _deferredKey = null;
                CancelTimer();
            }
        }
        foreach (var e in events) Changed?.Invoke(e);
    }

    private Candidate? Resolve(ContextInputs inputs)
    {
        var packs = _packs();
        var hit = PackMatcher.Best(packs, inputs);
        if (hit is null && inputs.App is not null && packs.FirstOrDefault(p => p.Layer == PackLayer.Base) is { } basePack)
        {
            // Nothing matches the app in front: the base (underlay) pack takes over (windows-shell's desktop page).
            hit = new PackHit(basePack, -1, basePack.Match.Any[0], $"no pack for {inputs.App.ProcessName}: base layer");
        }
        if (hit is null)
        {
            if (_current.Pack is { } keep && _current.Context is { } kc)
            {
                if (_options.KeepLastWhenNoMatch) return new Candidate(keep, kc, _current.App, "kept", _current.Since);
                return null;
            }
            return null;
        }
        var pack = hit.Pack;
        PackContext? best = null;
        var bestReason = "";
        foreach (var c in pack.Contexts)
        {
            string why;
            if (!DetectorEvaluator.Holds(c.Detect, inputs, out why))
            {
                if (!c.IsDefault) continue;
                why = "default";
            }
            if (best is null || c.Priority > best.Priority)
            {
                best = c;
                bestReason = c.IsDefault && why is "default" or "always" ? "default context" : why;
            }
        }
        best ??= pack.DefaultContext;
        return new Candidate(pack, best, inputs.App, $"{hit.Reason} → {pack.Id}; {best.Id}: {bestReason}", DateTimeOffset.MinValue);
    }

    private int Dwell(Candidate c)
    {
        if (_current.Pack is null || _current.Pack.Id != c.Pack.Id) return _current.Pack is null ? 0 : _options.AppDebounceMs;
        return Math.Max(c.Context.HysteresisMs, _current.Context?.HysteresisMs ?? 0);
    }

    private void Arm(TimeSpan due)
    {
        _timer ??= _time.CreateTimer(_ => Evaluate("timer"), null, Timeout.InfiniteTimeSpan, Timeout.InfiniteTimeSpan);
        _timer.Change(due < TimeSpan.Zero ? TimeSpan.Zero : due, Timeout.InfiniteTimeSpan);
    }

    private void CancelTimer() => _timer?.Change(Timeout.InfiniteTimeSpan, Timeout.InfiniteTimeSpan);

    private ContextEvent Record(ContextEventKind kind, string from, string to, string reason)
    {
        var e = new ContextEvent(kind, from, to, reason, _time.GetUtcNow());
        _history.AddLast(e);
        while (_history.Count > _options.HistorySize) _history.RemoveFirst();
        return e;
    }

    public void Dispose()
    {
        lock (_gate)
        {
            _disposed = true;
            _timer?.Dispose();
        }
        _foreground.Changed -= OnInputChanged;
        _sight.Changed -= OnInputChanged;
        _fields.Changed -= OnInputChanged;
    }
}
