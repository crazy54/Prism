using PrismControl.Core.Actions;
using PrismControl.Core.Devices;
using PrismControl.Core.Hosting;
using PrismControl.Desktop;
using PrismControl.Desktop.Sight;
using PrismControl.Smart.Context;
using PrismControl.Smart.Execution;
using PrismControl.Smart.Layout;
using PrismControl.Smart.Packs;
using PrismControl.Smart.Prefs;

namespace PrismControl.Smart.Runtime;

/// <summary>Timing rules of the Smart Deck.</summary>
public sealed record SmartEngineOptions
{
    /// <summary>Hold time of a <c>confirm</c> key (fires while still held, at the threshold).</summary>
    public TimeSpan ConfirmHold { get; init; } = TimeSpan.FromMilliseconds(700);
    /// <summary>A <c>confirm</c> dial push arms for this long; a second push inside it fires (Galleon has no holds).</summary>
    public TimeSpan ArmWindow { get; init; } = TimeSpan.FromSeconds(3);
    /// <summary>A dial counts as "in use" this long after its last tick: no context switch moves it mid-spin.</summary>
    public TimeSpan TurnGrace { get; init; } = TimeSpan.FromMilliseconds(400);
    /// <summary>Unsent dial ticks older than this are dropped (the user stopped turning).</summary>
    public TimeSpan MaxTurnBacklogAge { get; init; } = TimeSpan.FromMilliseconds(1500);
    /// <summary>The largest tick backlog kept while a turn is still executing.</summary>
    public int MaxTickBacklog { get; init; } = 24;
    public TimeSpan FlashFor { get; init; } = TimeSpan.FromMilliseconds(1200);
    /// <summary>Slots appear one by one when a profile loads: layouts settle this long after the last one.</summary>
    public TimeSpan RegenDebounce { get; init; } = TimeSpan.FromMilliseconds(60);
    /// <summary>Live values (Sight, modules) redraw at most this often.</summary>
    public TimeSpan LiveRedraw { get; init; } = TimeSpan.FromMilliseconds(100);
    /// <summary>How long the user holds a REVIEW key (a physical deck only) to approve an AI proposal.</summary>
    public TimeSpan ReviewHold { get; init; } = TimeSpan.FromMilliseconds(1500);
    /// <summary>A never-auto verb ignores a second press of its key within this time (no repeats, no bounce).</summary>
    public TimeSpan NeverAutoGap { get; init; } = TimeSpan.FromMilliseconds(500);
}

/// <summary>What the engine needs from the world. Tests pass fakes; the module passes Desktop's real services.</summary>
public sealed record SmartEngineParts
{
    public required Func<IReadOnlyList<ContextPack>> Packs { get; init; }
    public required IForegroundSource Foreground { get; init; }
    public required ISmartSight Sight { get; init; }
    public required IVerbRegistry Verbs { get; init; }
    public required IInputSender Input { get; init; }
    public required IMouseSender Mouse { get; init; }
    public required TimeProvider Time { get; init; }
    public IFieldSource? Fields { get; init; }
    public ILog Log { get; init; } = NullLog.Instance;
    public SmartPreferences? Preferences { get; init; }
    /// <summary>Persists preferences (global settings section "smart"). Null = in memory only.</summary>
    public Action<SmartPreferences>? SavePreferences { get; init; }
    public SmartEngineOptions Options { get; init; } = new();
    public FileFieldReader? Files { get; init; }
}

/// <summary>
/// The Smart Deck runtime: follows the context, generates one layout per device, tells each smart slot what it is now,
/// and runs its bindings when the user presses or turns it. Thread-safe; actions call it from their mailboxes and it
/// calls back with <c>invalidate</c> (the action posts a render).
/// </summary>
public sealed class SmartEngine : IDisposable
{
    private readonly SmartEngineParts _p;
    private readonly ILog _log;
    private readonly object _gate = new();
    private readonly Dictionary<string, DeviceDeck> _devices = new(StringComparer.Ordinal);
    private readonly Dictionary<string, SmartSlot> _slots = new(StringComparer.Ordinal);
    private readonly ITimer _regenTimer, _liveTimer, _graceTimer;
    private SmartPreferences _prefs;
    private bool _regenDirty;
    private bool _liveDirty;
    private bool _disposed;

    private sealed class DeviceDeck(DeviceInfo device)
    {
        public DeviceInfo Device { get; set; } = device;
        public DeviceGeometry Geometry => DeviceGeometry.For(Device);
        public int Page;
        public DeckLayout Layout = DeckLayout.Empty(DeviceGeometry.For(device).Kind);
        public ContextPack? Pack;
    }

    public SmartEngine(SmartEngineParts parts)
    {
        _p = parts;
        _log = parts.Log.For("smart");
        _prefs = (parts.Preferences ?? new SmartPreferences()).Clone();
        Fields = parts.Fields ?? new RegistryFieldSource(parts.Verbs);
        Counted = new CountedSteps();
        Known = new KnownValues();
        Readouts = new ReadoutResolver(parts.Sight, Fields, Counted, parts.Time, parts.Files);
        Executor = new BindingExecutor(parts.Input, parts.Mouse, parts.Foreground, parts.Sight, parts.Verbs, parts.Time, parts.Log);
        Context = new ContextEngine(parts.Packs, parts.Foreground, parts.Sight, Fields, parts.Time, HoldReason, ContextOptionsFrom(_prefs), parts.Log);
        Context.Changed += OnContextEvent;
        _regenTimer = parts.Time.CreateTimer(_ => RegenerateAll("slots changed"), null, Timeout.InfiniteTimeSpan, Timeout.InfiniteTimeSpan);
        _liveTimer = parts.Time.CreateTimer(_ => FlushLive(), null, Timeout.InfiniteTimeSpan, Timeout.InfiniteTimeSpan);
        _graceTimer = parts.Time.CreateTimer(_ => Context.NotifyHoldReleased(), null, Timeout.InfiniteTimeSpan, Timeout.InfiniteTimeSpan);
        parts.Sight.Changed += MarkLive;
        Fields.Changed += MarkLive;
        parts.Foreground.Changed += MarkLive;
        parts.Foreground.Changed += OnForegroundChanged;
    }

    public ContextEngine Context { get; }
    public BindingExecutor Executor { get; }
    public ReadoutResolver Readouts { get; }
    public CountedSteps Counted { get; }
    /// <summary>The last known value of each clamped control (seeded from readouts; E1).</summary>
    public KnownValues Known { get; }

    /// <summary>
    /// Approves an AI proposal (pack id, verb id, who) after the user held its REVIEW key on a physical deck; returns an
    /// error message or null. The module wires it to the AI channel's operations (they write the user's override file).
    /// </summary>
    public Func<string, string, string, string?>? ReviewApprover { get; set; }
    public IFieldSource Fields { get; }
    public SmartEngineOptions Options => _p.Options;
    public TimeProvider Time => _p.Time;
    public ISmartSight Sight => _p.Sight;
    public IVerbRegistry Verbs => _p.Verbs;

    public SmartPreferences Preferences { get { lock (_gate) return _prefs.Clone(); } }

    private static ContextOptions ContextOptionsFrom(SmartPreferences p) => new() { AppDebounceMs = Math.Clamp(p.AppDebounceMs, 0, 2000), KeepLastWhenNoMatch = p.KeepLastWhenNoMatch };

    /// <summary>New preferences (the global "smart" section changed, or the PI/MCP edited them). Layouts regenerate.</summary>
    public void UpdatePreferences(SmartPreferences prefs, bool save = false)
    {
        var copy = prefs.Clone();
        lock (_gate) _prefs = copy;
        Context.Options = ContextOptionsFrom(copy);
        if (save) _p.SavePreferences?.Invoke(copy.Clone());
        RegenerateAll("preferences changed");
    }

    /// <summary>Changes preferences with a mutation, saves them, and regenerates.</summary>
    public void EditPreferences(Action<SmartPreferences> edit)
    {
        SmartPreferences next;
        lock (_gate)
        {
            next = _prefs.Clone();
            edit(next);
        }
        UpdatePreferences(next, save: true);
    }

    /// <summary>Packs or rebinds were reloaded.</summary>
    public void PacksChanged() => Context.RefreshPacks();

    // ================================================================== slots

    /// <param name="utility">A fixed "lock page" key: never filled by the generator (the user placed it on purpose).</param>
    public SmartSlot Attach(string context, DeviceInfo device, Controller controller, Coordinates coordinates, Action invalidate, bool utility = false)
    {
        SmartSlot slot;
        lock (_gate)
        {
            if (!_devices.TryGetValue(device.Id, out var deck)) _devices[device.Id] = deck = new DeviceDeck(device);
            else deck.Device = device;
            slot = new SmartSlot(context, device, controller, coordinates, deck.Geometry, invalidate, ex => _log.Warn("smart slot work failed", ex)) { IsUtility = utility && controller == Controller.Keypad };
            _slots[context] = slot;
        }
        Context.Evaluate("slot attached");
        ScheduleRegen();
        return slot;
    }

    public void Detach(SmartSlot slot)
    {
        HoldBinding? hold;
        lock (_gate)
        {
            if (_slots.TryGetValue(slot.Context, out var cur) && ReferenceEquals(cur, slot)) _slots.Remove(slot.Context);
            hold = slot.ActiveHold;
            slot.ActiveHold = null;
            slot.KeyHeld = false;
            slot.DialPressed = false;
            slot.ReviewPending = false;
            slot.ReviewTimer?.Dispose();
            slot.ReviewTimer = null;
        }
        slot.Queue.Enqueue(async () =>
        {
            if (hold is not null) await Executor.HoldUpAsync(hold, slot).ConfigureAwait(false);
            await Executor.ReleaseOwnerAsync(slot).ConfigureAwait(false);
        });
        ScheduleRegen();
        Context.NotifyHoldReleased();
    }

    /// <summary>Every attached smart slot (SD2: "explain this slot" and the device list of the AI preferences channel).</summary>
    public IReadOnlyList<SmartSlot> Slots { get { lock (_gate) return [.. _slots.Values]; } }

    /// <summary>The layout a device shows now (for the PI, previews and tests).</summary>
    public DeckLayout LayoutFor(string deviceId) { lock (_gate) return _devices.TryGetValue(deviceId, out var d) ? d.Layout : DeckLayout.Empty("?"); }

    /// <summary>Waits until every slot's queued work (presses, holds, turns) has finished.</summary>
    public async Task WhenIdleAsync()
    {
        for (var i = 0; i < 50; i++)
        {
            SmartSlot[] slots;
            lock (_gate) slots = [.. _slots.Values];
            await Task.WhenAll(slots.Select(s => s.Queue.WhenIdle)).ConfigureAwait(false);
            if (slots.All(s => !s.Queue.Busy)) return;
        }
    }

    public bool IsBusy { get { lock (_gate) return _slots.Values.Any(s => s.Queue.Busy); } }

    private string? HoldReason()
    {
        lock (_gate)
        {
            var now = _p.Time.GetUtcNow();
            foreach (var s in _slots.Values)
            {
                if (s.KeyHeld) return $"{s} held";
                if (s.DialPressed) return $"{s} pressed";
                if (s.Draining || s.HasPendingTicks) return $"{s} turning";
                if (!s.IsKey && now - s.LastTurnAt < _p.Options.TurnGrace) return $"{s} turning";
            }
            return null;
        }
    }

    private bool AnyHeldLocked() => _slots.Values.Any(s => s.KeyHeld || s.DialPressed || s.Draining);

    // ================================================================== layouts

    private void OnContextEvent(ContextEvent e)
    {
        if (e.Kind is ContextEventKind.Switched)
        {
            lock (_gate) foreach (var d in _devices.Values) d.Page = 0;
            RegenerateAll("context: " + e.Reason);
        }
        else if (e.Kind is ContextEventKind.Refreshed) RegenerateAll("packs reloaded");
        else InvalidateAll();
    }

    private void ScheduleRegen() => _regenTimer.Change(_p.Options.RegenDebounce, Timeout.InfiniteTimeSpan);

    /// <summary>Regenerates every device's layout now (unless a slot is held: then right after it is released).</summary>
    public void RegenerateAll(string why)
    {
        var toInvalidate = new List<SmartSlot>();
        lock (_gate)
        {
            if (_disposed) return;
            if (AnyHeldLocked())
            {
                _regenDirty = true;
                return;
            }
            _regenDirty = false;
            var state = Context.Current;
            foreach (var deck in _devices.Values)
            {
                var before = deck.Layout;
                deck.Layout = Generate(deck, state);
                deck.Pack = state.Pack;
                var changed = before.Describe() != deck.Layout.Describe() || before.PackId != deck.Layout.PackId || before.ContextId != deck.Layout.ContextId;
                foreach (var s in _slots.Values.Where(s => s.Device.Id == deck.Device.Id)) toInvalidate.Add(s);
                if (changed) _log.Debug($"{deck.Device.Name}: {deck.Layout.PackId}/{deck.Layout.ContextId} page {deck.Layout.Page + 1}/{deck.Layout.PageCount} ({why})");
            }
        }
        foreach (var s in toInvalidate) s.Invalidate();
    }

    private DeckLayout Generate(DeviceDeck deck, ContextState state)
    {
        var geo = deck.Geometry;
        if (state.Pack is null || state.Context is null || !_prefs.Enabled) return DeckLayout.Empty(geo.Kind);
        var mine = _slots.Values.Where(s => s.Device.Id == deck.Device.Id && !s.IsUtility).ToList();
        var underlay = state.Pack.Layer == PackLayer.Base ? null : _p.Packs().FirstOrDefault(p => p.Layer == PackLayer.Base);
        var req = new LayoutRequest(state.Pack, state.Context.Id, geo,
            [.. mine.Where(s => s.IsKey).Select(s => s.Key)], [.. mine.Where(s => !s.IsKey).Select(s => s.Dial)], _prefs, deck.Page, underlay);
        var layout = LayoutGenerator.Generate(req);
        deck.Page = layout.Page;
        return layout;
    }

    private void MarkLive()
    {
        lock (_gate)
        {
            if (_liveDirty || _disposed) return;
            _liveDirty = true;
        }
        _liveTimer.Change(_p.Options.LiveRedraw, Timeout.InfiniteTimeSpan);
    }

    private void FlushLive()
    {
        lock (_gate) _liveDirty = false;
        InvalidateAll();
    }

    public void InvalidateAll()
    {
        SmartSlot[] slots;
        lock (_gate) slots = [.. _slots.Values];
        foreach (var s in slots) s.Invalidate();
    }

    // ================================================================== input

    private (ContextPack? Pack, DeckLayout Layout, ContextState State) Snapshot(SmartSlot s)
    {
        var state = Context.Current;
        var layout = _devices.TryGetValue(s.Device.Id, out var d) ? d.Layout : DeckLayout.Empty("?");
        var pack = state.Pack is not null && state.Pack.Id == layout.PackId ? state.Pack : null;
        return (pack, layout, state);
    }

    private ExecContext Exec(ContextPack pack, ContextState state, DeckGesture? token, VerbGestureKind kind, PackVerb? verb = null) =>
        new(pack, state.App, token, kind, verb?.IsGlobal ?? false) { Safety = verb is null ? Safety.Safe : EffectiveSafety(verb) };

    private static ContextPack PackOf(KeyAssignment a, ContextPack layoutPack) => a is VerbKey { From: { } from } ? from : layoutPack;

    /// <summary>
    /// The verb's safety: the stricter of the pack's and (for a module verb, or one with a module alternative) the module
    /// descriptor's own (review E6). Safe &lt; never-auto &lt; confirm.
    /// </summary>
    public Safety EffectiveSafety(PackVerb v)
    {
        var s = v.Safety;
        foreach (var b in v.AltBindings.Prepend(v.Binding))
            if (b is ModuleBinding mb && _p.Verbs.TryResolveVerb(mb.Verb, out _, out var desc) && SafetyRules.Parse(desc.Safety) is { } ms)
                s = SafetyRules.Stricter(s, ms);
        return s;
    }

    /// <summary>Base-layer (windows-shell) keys never run under a display-only or online-competitive pack (review E13).</summary>
    public static bool UnderlayAllowed(ContextPack pack) => !pack.IsDisplayOnly && pack.Policy.Class != PolicyClass.OnlineCompetitive;

    /// <summary>
    /// The binding a verb runs now: its own, or (when that is a module verb whose module isn't there or isn't ready)
    /// the first alternative that can run, e.g. Chrome's TAB 1 = browser.tab.focus, else Ctrl+1.
    /// </summary>
    public Binding Effective(PackVerb v)
    {
        if (Usable(v.Binding)) return v.Binding;
        foreach (var alt in v.AltBindings)
            if (alt is not UnboundBinding && Usable(alt)) return alt;
        return v.Binding;
    }

    private bool Usable(Binding b) => b switch
    {
        ModuleBinding mb => _p.Verbs.TryResolveVerb(mb.Verb, out var prov, out _) && prov.GetStatus(mb.Verb).IsReady,
        UnboundBinding => false,
        _ => true,
    };

    /// <summary>
    /// Review E4: a confirm verb fires at the END of its hold. If a context switch is waiting (the hold deferred it) to a
    /// page where this verb doesn't exist or does something else, the chord would land in the wrong page: refuse.
    /// </summary>
    private bool SwitchesAway(VerbKey vk, ContextPack layoutPack, out string why)
    {
        why = "";
        if (Context.PendingTarget is not { } next) return false;
        if (vk.From is not null)
        {
            if (UnderlayAllowed(next.Pack)) return false;
            why = $"the page is changing to {next.Pack.Name}";
            return true;
        }
        if (next.Pack.FindVerb(vk.Verb.Id) is { } nv && next.Pack.ValidityTier(nv.Contexts, next.Context.Id) >= 0 && Effective(nv).Describe() == Effective(vk.Verb).Describe())
            return false;
        why = next.Pack.Id == layoutPack.Id ? $"the page is changing to {next.Context.Label}" : $"the page is changing to {next.Pack.Name}";
        return true;
    }

    /// <summary>Key down: safe verbs run now; whilePressed holds press; confirm verbs start their hold ring; a REVIEW key starts its approval hold.</summary>
    public void KeyDown(SmartSlot s, DeckGesture token)
    {
        lock (_gate)
        {
            var (pack, layout, state) = Snapshot(s);
            var now = _p.Time.GetUtcNow();
            s.KeyHeld = true;
            s.HoldFired = false;
            s.HeldSince = now;
            s.ReviewPending = false;
            var a = s.IsUtility ? new EmptyKey("lock key") : layout.KeyAt(s.Key);
            s.HeldAssignment = a;
            if (!_prefs.Enabled || pack is null || a is not VerbKey vk) return;
            var verb = vk.Verb;
            if (verb.PendingBinding is not null)
            {
                // An AI proposal waits: this key belongs to the review. Nothing is sent; a long hold on a physical deck approves.
                s.ReviewPending = true;
                if (Control.PairingService.IsPhysical(s.Device))
                {
                    var vpack = PackOf(vk, pack).Id;
                    s.ReviewTimer?.Dispose();
                    s.ReviewTimer = _p.Time.CreateTimer(_ => ReviewHoldReached(s, vpack, verb.Id), null, _p.Options.ReviewHold, Timeout.InfiniteTimeSpan);
                }
                goto invalidate;
            }
            if (vk.From is not null && !UnderlayAllowed(pack))
            {
                SetFlashLocked(s, "BLOCKED", error: true);
                goto invalidate;
            }
            var safety = EffectiveSafety(verb);
            if (safety == Safety.Confirm)
            {
                s.ConfirmPending = true;
                return;
            }
            if (safety == Safety.NeverAuto)
            {
                // Deliberate presses only: a second press within the gap (a bounce, a double tap) is ignored.
                if (s.LastNeverAutoVerb == verb.Id && now - s.LastNeverAutoAt < _p.Options.NeverAutoGap) return;
                s.LastNeverAutoVerb = verb.Id;
                s.LastNeverAutoAt = now;
            }
            var x = Exec(PackOf(a, pack), state, token, VerbGestureKind.KeyPress, verb);
            var binding = Effective(verb);
            if (binding is HoldBinding { Mode: HoldMode.WhilePressed } h)
            {
                s.ActiveHold = h;
                s.HoldApp = x.App;
                s.Queue.Enqueue(async () =>
                {
                    var r = await Executor.HoldDownAsync(h, x, s).ConfigureAwait(false);
                    if (!r.Ok) { lock (_gate) if (ReferenceEquals(s.ActiveHold, h)) s.ActiveHold = null; }
                    Report(s, r, verb.Id);
                });
                return;
            }
            s.Queue.Enqueue(async () => Report(s, await Executor.RunAsync(binding, x).ConfigureAwait(false), verb.Id));
        }
    invalidate:
        s.Invalidate();
    }

    /// <summary>The REVIEW key was held long enough on a physical deck: approve the AI proposal (the user's own decision).</summary>
    private void ReviewHoldReached(SmartSlot s, string packId, string verbId)
    {
        lock (_gate)
        {
            if (!s.KeyHeld || !s.ReviewPending) return;
            s.ReviewPending = false;
            s.HoldFired = true;
            s.ReviewTimer?.Dispose();
            s.ReviewTimer = null;
        }
        string? error;
        try { error = ReviewApprover is { } approve ? approve(packId, verbId, "deck") : "approval isn't available"; }
        catch (Exception ex) { error = ex.GetType().Name; _log.Warn("approving an AI proposal failed", ex); }
        if (error is null) SetFlash(s, "APPROVED", error: false);
        else
        {
            _log.Info($"{packId}/{verbId}: approval refused: {error}");
            SetFlash(s, "NOT APPROVED", error: true);
        }
    }

    /// <summary>The key has been held for the long-press threshold (still down): confirm verbs fire; MORE toggles the page lock.</summary>
    public void KeyHoldReached(SmartSlot s, DeckGesture token)
    {
        var toggleLock = false;
        lock (_gate)
        {
            if (!s.KeyHeld) return;
            var (pack, _, state) = Snapshot(s);
            switch (s.HeldAssignment)
            {
                case VerbKey vk when s.ConfirmPending && pack is not null:
                    s.ConfirmPending = false;
                    s.HoldFired = true;
                    if (SwitchesAway(vk, pack, out var why))
                    {
                        _log.Info($"{vk.Verb.Id}: not sent, {why}");
                        SetFlashLocked(s, "PAGE CHANGED", error: true);
                        break;
                    }
                    var x = Exec(PackOf(vk, pack), state, token, VerbGestureKind.KeyHold, vk.Verb);
                    var verb = vk.Verb;
                    var held = Effective(verb);
                    s.Queue.Enqueue(async () => Report(s, await Executor.RunAsync(held, x).ConfigureAwait(false), verb.Id, okFlash: "DONE"));
                    break;
                case MoreKey:
                    s.HoldFired = true;
                    toggleLock = true;
                    break;
            }
        }
        if (toggleLock)
        {
            var locked = !Context.IsLocked;
            Context.SetLocked(locked, "the MORE key was held");
            SetFlash(s, locked ? "LOCKED" : "UNLOCKED", error: false);
        }
        s.Invalidate();
    }

    public void KeyUp(SmartSlot s, DeckGesture token)
    {
        var nextPage = false;
        var toggleLock = false;
        lock (_gate)
        {
            if (!s.KeyHeld) return;
            s.KeyHeld = false;
            if (s.ActiveHold is { } h)
            {
                s.ActiveHold = null;
                s.HoldApp = null;
                s.Queue.Enqueue(() => Executor.HoldUpAsync(h, s));
            }
            if (s.ConfirmPending && !s.HoldFired)
            {
                s.ConfirmPending = false;
                SetFlashLocked(s, "HOLD", error: false);
            }
            if (s.ReviewPending)
            {
                // Let go before the ring was full: nothing approved, nothing sent.
                s.ReviewPending = false;
                s.ReviewTimer?.Dispose();
                s.ReviewTimer = null;
                SetFlashLocked(s, Control.PairingService.IsPhysical(s.Device) ? "HOLD TO OK" : "REVIEW IN PI", error: false);
            }
            if (s.HeldAssignment is MoreKey && !s.HoldFired) nextPage = true;
            toggleLock = s.IsUtility;
            s.HeldAssignment = null;
            s.HoldFired = false;
        }
        if (nextPage) TurnPage(s.Device.Id, +1);
        if (toggleLock)
        {
            var locked = !Context.IsLocked;
            Context.SetLocked(locked, "the lock key was pressed");
            SetFlash(s, locked ? "LOCKED" : "UNLOCKED", error: false);
        }
        Released();
        s.Invalidate();
    }

    /// <summary>
    /// Review E5: when the app a whilePressed hold went to leaves the front (Alt-Tab, a pop-up), its keys go up at once,
    /// not when the deck key is let go (or the 10 s watchdog).
    /// </summary>
    private void OnForegroundChanged()
    {
        var release = new List<(SmartSlot Slot, HoldBinding Hold)>();
        lock (_gate)
        {
            if (_disposed) return;
            foreach (var s in _slots.Values)
            {
                if (s.ActiveHold is not { } h) continue;
                if (s.HoldApp is { } app && _p.Foreground.IsInFront(app)) continue;
                s.ActiveHold = null;
                s.HoldApp = null;
                SetFlashLocked(s, "WINDOW CHANGED", error: true);
                release.Add((s, h));
            }
        }
        foreach (var (s, h) in release)
        {
            _log.Info($"{s}: released {h.Chord}: its app left the front");
            s.Queue.Enqueue(() => Executor.HoldUpAsync(h, s));
            s.Invalidate();
        }
    }

    /// <summary>Moves a device to the next/previous page (wraps).</summary>
    public void TurnPage(string deviceId, int delta)
    {
        lock (_gate)
        {
            if (!_devices.TryGetValue(deviceId, out var d) || d.Layout.PageCount <= 1) return;
            d.Page = ((d.Page + delta) % d.Layout.PageCount + d.Layout.PageCount) % d.Layout.PageCount;
        }
        RegenerateAll("page");
    }

    public void DialRotate(SmartSlot s, int ticks, DeckGesture token)
    {
        if (ticks == 0) return;
        var start = false;
        lock (_gate)
        {
            var now = _p.Time.GetUtcNow();
            s.LastTurnAt = now;
            if (!_prefs.Enabled) return;
            var (pack, layout, state) = Snapshot(s);
            var control = layout.DialAt(s.Dial).Control;
            if (pack is null || control is null) return;
            // A backlog belongs to the control and the app that were under the dial when the turn started (E11).
            if (s.HasPendingTicks && (s.DialControl != control || s.DialApp?.Hwnd != state.App?.Hwnd)) s.PendingEvents.Clear();
            s.DialPack = pack;
            s.DialControl = control;
            s.DialApp = state.App;
            // Each event keeps its own magnitude (E2); the backlog stays within ±MaxTickBacklog ticks in all.
            var room = _p.Options.MaxTickBacklog - s.PendingEvents.Sum(Math.Abs);
            var kept = Math.Sign(ticks) * Math.Min(Math.Abs(ticks), Math.Max(0, room));
            if (kept != 0) s.PendingEvents.Add(kept);
            s.PendingToken = token;
            s.PendingAt = now;
            if (!s.Draining && s.HasPendingTicks) { s.Draining = true; start = true; }
        }
        if (start) s.Queue.Enqueue(() => DrainTurnsAsync(s));
        _graceTimer.Change(_p.Options.TurnGrace + TimeSpan.FromMilliseconds(10), Timeout.InfiniteTimeSpan);
    }

    /// <summary>
    /// The control's value for the clamp (E1): a fresh observed/inferred reading of its own readout (that also seeds our
    /// known value), else the last known value carried by our presses, else null (unknown: no clamp).
    /// </summary>
    private double? ClampValue(ContextPack pack, PackControl control, ForegroundApp? app)
    {
        if (control.Turn.ClampMin is null && control.Turn.ClampMax is null) return null;
        if (control.Readout is { } rid && pack.FindReadout(rid) is { } ro)
        {
            var v = Readouts.Read(pack, ro, app).Value;
            if (v.Number is { } n && v.Confidence is ReadoutConfidence.Observed or ReadoutConfidence.Inferred)
            {
                Known.Set(pack.Id, control.Id, n);
                return n;
            }
        }
        return Known.Get(pack.Id, control.Id);
    }

    private async Task DrainTurnsAsync(SmartSlot s)
    {
        while (true)
        {
            List<int> events;
            DeckGesture? token;
            ContextPack pack;
            PackControl control;
            ForegroundApp? app;
            lock (_gate)
            {
                if (!s.HasPendingTicks || s.DialPack is null || s.DialControl is null)
                {
                    s.Draining = false;
                    s.PendingEvents.Clear();
                    break;
                }
                if (_p.Time.GetUtcNow() - s.PendingAt > _p.Options.MaxTurnBacklogAge)
                {
                    _log.Debug($"dropped {s.PendingEvents.Sum()} stale tick(s) on {s}");
                    s.PendingEvents.Clear();
                    s.Draining = false;
                    break;
                }
                events = [.. s.PendingEvents];
                s.PendingEvents.Clear();
                token = s.PendingToken;
                pack = s.DialPack;
                control = s.DialControl;
                app = s.DialApp;
                // E11: the deck may have followed another app or pack since the turn was queued: never send it there.
                var now = Context.Current;
                if (now.Pack?.Id != pack.Id || (app is not null && now.App?.Hwnd != app.Hwnd))
                {
                    _log.Debug($"dropped {events.Sum()} tick(s) on {s}: the context changed");
                    continue;
                }
            }
            var current = ClampValue(pack, control, app);
            var plan = TurnPlanner.PlanBatch(control, events, current);
            if (plan is null) continue;
            var r = await Executor.TurnAsync(plan, new ExecContext(pack, app, token, VerbGestureKind.DialTurn)).ConfigureAwait(false);
            var moved = r.Ok ? plan.Presses : r.Steps;
            if (moved > 0)
            {
                var unit = control.Turn.Step.PerPress;
                Counted.Add(pack.Id, control.Id, plan.Direction * moved * (unit ?? 1));
                if (current is { } c) Known.Set(pack.Id, control.Id, unit is { } u ? c + plan.Direction * moved * u : null);
            }
            Report(s, r, control.Id, quiet: true);
        }
        Released();
        s.Invalidate();
    }

    public void DialDown(SmartSlot s)
    {
        lock (_gate) s.DialPressed = true;
    }

    /// <summary>A dial push (Galleon short push, Stream Deck + push or touch tap): the control's push verb; confirm verbs arm first.</summary>
    public void DialPush(SmartSlot s, DeckGesture token)
    {
        lock (_gate)
        {
            s.DialPressed = false;
            var (pack, layout, state) = Snapshot(s);
            var control = layout.DialAt(s.Dial).Control;
            if (!_prefs.Enabled || pack is null || control?.PushVerb is not { } pushId || pack.FindVerb(pushId) is not { } verb) { goto done; }
            var now = _p.Time.GetUtcNow();
            if (verb.PendingBinding is not null)
            {
                // A dial push can't hold: an AI proposal on a push verb is reviewed in the PI.
                SetFlashLocked(s, "REVIEW IN PI", error: false);
                goto done;
            }
            var safety = EffectiveSafety(verb);
            if (safety == Safety.Confirm)
            {
                if (s.ArmedVerb != verb.Id || now > s.ArmedUntil)
                {
                    s.ArmedVerb = verb.Id;
                    s.ArmedUntil = now + _p.Options.ArmWindow;
                    SetFlashLocked(s, "PUSH AGAIN", error: false, until: s.ArmedUntil);
                    goto done;
                }
                s.ArmedVerb = null;
                s.ArmedUntil = default;
                if (SwitchesAway(new VerbKey(verb, ""), pack, out var why))
                {
                    _log.Info($"{verb.Id}: not sent, {why}");
                    SetFlashLocked(s, "PAGE CHANGED", error: true);
                    goto done;
                }
            }
            var x = Exec(pack, state, token, VerbGestureKind.DialPush, verb);
            var controlId = control.Id;
            var packId = pack.Id;
            var pushBinding = Effective(verb);
            s.Queue.Enqueue(async () =>
            {
                var r = await Executor.RunAsync(pushBinding, x).ConfigureAwait(false);
                if (r.Ok)
                {
                    Counted.Reset(packId, controlId);
                    Known.Set(packId, controlId, null);
                }
                Report(s, r, verb.Id, okFlash: verb.Label);
            });
        }
    done:
        Released();
        s.Invalidate();
    }

    private void Released()
    {
        bool regen;
        lock (_gate) regen = _regenDirty && !AnyHeldLocked();
        if (regen) RegenerateAll("deferred until release");
        Context.NotifyHoldReleased();
    }

    private void Report(SmartSlot s, ExecResult r, string item, string? okFlash = null, bool quiet = false)
    {
        if (!r.Ok)
        {
            _log.Info($"{item}: {r.Outcome} ({r.Message})");
            SetFlash(s, r.Flash ?? "DIDN'T WORK", error: true);
        }
        else if (okFlash is not null && !quiet) SetFlash(s, okFlash, error: false);
        s.Invalidate();
    }

    private void SetFlash(SmartSlot s, string text, bool error)
    {
        lock (_gate) SetFlashLocked(s, text, error);
        s.Invalidate();
    }

    private void SetFlashLocked(SmartSlot s, string text, bool error, DateTimeOffset? until = null)
    {
        s.Flash = text;
        s.FlashIsError = error;
        s.FlashUntil = until ?? _p.Time.GetUtcNow() + _p.Options.FlashFor;
    }

    // ================================================================== views

    public SlotView View(SmartSlot s)
    {
        lock (_gate)
        {
            var now = _p.Time.GetUtcNow();
            var (pack, layout, state) = Snapshot(s);
            var flash = s.Flash is not null && now < s.FlashUntil ? s.Flash : null;
            var common = new SlotView
            {
                Flash = flash,
                FlashIsError = s.FlashIsError,
                Locked = Context.IsLocked,
                Page = layout.Page,
                PageCount = layout.PageCount,
                PackName = pack?.Name ?? "",
                ContextLabel = state.Context?.Label ?? "",
                LabelSize = _prefs.LabelSize,
                BigIcons = _prefs.BigIcons,
                Hue = pack is null ? 0 : HueFor(pack.Id),
            };
            if (s.IsUtility) return common with { Kind = SlotKind.Lock, Label = Context.IsLocked ? "LOCKED" : "LOCK", Glyph = "lock", Why = "Your lock-page key: press to freeze the deck on this page (press again to follow the screen).", ItemId = "smart.lock" };
            if (!_prefs.Enabled) return common with { Kind = SlotKind.Idle, Label = "SMART OFF", Why = "Smart Deck is switched off in the preferences." };
            if (pack is null)
                return common with { Kind = SlotKind.Idle, Label = state.App?.ProcessName is { } pn ? "NO PACK" : "SMART", Eyebrow = null, Why = state.App is null ? "Waiting for an app in front." : "No context pack matches the app in front." };
            var inFront = Context.IsAppInFront();
            var elevated = state.App is { } app && _p.Foreground.IsElevated(app);
            if (s.IsKey)
            {
                var a = s.KeyHeld && s.HeldAssignment is { } held ? held : layout.KeyAt(s.Key);
                switch (a)
                {
                    case VerbKey vk:
                    {
                        var v = vk.Verb;
                        var vpack = PackOf(vk, pack);
                        var view = common with
                        {
                            Kind = SlotKind.Verb, Label = v.Label, Glyph = v.Glyph, Monogram = v.Monogram, Safety = EffectiveSafety(v), Why = vk.Why, ItemId = v.Id,
                            IsToggle = v.Category == VerbCategory.Toggle,
                            Availability = Availability(vpack, Effective(v), v.Unavailable, inFront || v.IsGlobal || vk.From is not null, elevated),
                            AiBound = v.AiBound,
                            Review = v.PendingBinding?.Describe(),
                            ReviewProgress = v.PendingBinding is not null && s.ReviewPending && s.KeyHeld
                                ? Math.Clamp((now - s.HeldSince) / _p.Options.ReviewHold, 0, 1) : null,
                        };
                        if (view.Review is not null) return view;   // a REVIEW key shows the proposal, not its readout
                        if (v.StateReadout is { } sr && vpack.FindReadout(sr) is { } ro)
                        {
                            var rv = Readouts.Read(vpack, ro, state.App);
                            if (v.Category == VerbCategory.Toggle) view = view with { On = ReadoutResolver.StateOf(rv.Value), StateConfidence = rv.Value.Confidence };
                            // A readout verb is a key that shows its value under the verb's label (a press still runs its binding).
                            else if (v.Category == VerbCategory.Readout && view.Availability.Ready) view = view with { Kind = SlotKind.Readout, Readout = rv };
                            else if (rv.IsKnown) view = view with { Badge = rv.Text, StateConfidence = rv.Value.Confidence };
                        }
                        if (s.ConfirmPending && s.KeyHeld)
                            view = view with { HoldProgress = Math.Clamp((now - s.HeldSince) / _p.Options.ConfirmHold, 0, 1) };
                        return view;
                    }
                    case MoreKey m:
                        return common with { Kind = SlotKind.More, Label = "MORE", Glyph = "pages", Badge = $"{m.Page + 1}/{m.PageCount}", Why = m.Why, ItemId = "smart.more" };
                    case ReadoutKey rk:
                        return common with { Kind = SlotKind.Readout, Label = rk.Readout.Label, Readout = Readouts.Read(pack, rk.Readout, state.App), Why = rk.Why, ItemId = rk.Readout.Id };
                    default:
                        return common with { Kind = SlotKind.Empty, Why = a.Why };
                }
            }
            var d = layout.DialAt(s.Dial);
            var readout = d.Readout is { } r ? Readouts.Read(pack, r, state.App) : null;
            if (d.Control is not { } c)
                return common with { Kind = readout is null ? SlotKind.Empty : SlotKind.Readout, Label = readout?.Readout.Label ?? "", Readout = readout, Why = d.Why, ItemId = d.Readout?.Id };
            var push = c.PushVerb is { } pv ? pack.FindVerb(pv) : null;
            var armed = push is not null && s.ArmedVerb == push.Id && now <= s.ArmedUntil;
            return common with
            {
                Kind = SlotKind.Control, Label = c.Label, Glyph = c.Glyph, Monogram = c.Monogram, Readout = readout, Why = d.Why, ItemId = c.Id,
                PushLabel = push?.Label, Safety = push is null ? Safety.Safe : EffectiveSafety(push), Armed = armed,
                Review = push?.PendingBinding?.Describe(), AiBound = push?.AiBound ?? false,
                ArmedSecondsLeft = armed ? Math.Max(0, (s.ArmedUntil - now).TotalSeconds) : 0,
                Availability = Availability(pack, c.Turn.Right, c.Unavailable, inFront, elevated),
            };
        }
    }

    /// <summary>Whether a binding can run right now, and the pack's unavailable face for why not.</summary>
    private SlotAvailability Availability(ContextPack pack, Binding b, Unavailable u, bool inFront, bool elevated)
    {
        SlotAvailability Face(string reason, string? fallbackLabel, string fallbackHint, string? fallbackStyle = null)
        {
            var listed = u.When.Contains(reason);
            return new SlotAvailability(false, reason, listed ? u.Label : fallbackLabel, listed ? u.Hint : fallbackHint, listed ? u.Style : fallbackStyle ?? "dim");
        }
        if (b is UnboundBinding { Reason: "key-taken" } taken) return Face("unbound", "KEY TAKEN", taken.Note ?? "Your own key binds give this key to another command.");
        if (b is UnboundBinding ub) return Face("unbound", "BIND ME", ub.Suggest is null ? "No key in the app for this." : $"No key in the app; bind {ub.Suggest} in its settings.");
        if (pack.IsDisplayOnly && b.SendsInput) return Face("policyBlocked", "VIEW ONLY", "This pack only shows things; it never sends input.");
        if (b.UsesSight && !pack.Policy.AllowsClosedLoop) return Face("policyBlocked", "BLOCKED", "Sight input only runs for safe-offline games.");
        if (b is ModuleBinding mb)
        {
            if (!_p.Verbs.TryResolveVerb(mb.Verb, out var prov, out _)) return Face("moduleMissing", null, $"Needs the {mb.Verb.Split('.')[0]} module.");
            var st = prov.GetStatus(mb.Verb);
            if (!st.IsReady)
            {
                var reason = st.Availability switch
                {
                    VerbAvailability.NotConnected => "notConnected", VerbAvailability.NothingSelected => "nothingSelected",
                    VerbAvailability.PermissionNeeded => "permissionNeeded", VerbAvailability.Busy => "busy", _ => "moduleMissing",
                };
                return Face(reason, null, st.Hint ?? "Not available right now.");
            }
            return SlotAvailability.Go;
        }
        if (!inFront) return Face("notForeground", ShortName(pack), $"{pack.Name} isn't in front.");
        if (elevated) return new SlotAvailability(false, "elevated", "ADMIN", $"{pack.Name} runs as administrator; Prism Control can't send it input.", "dim");
        if (b.UsesSight)
        {
            if (!_p.Sight.IsAvailable || _p.Sight.Current.State != SightRunState.Running) return Face("sightLost", null, "Needs Prism Sight on this screen.");
            foreach (var region in PackValidator.SightRegionsOf(b))
                if (SightReader.Presence(_p.Sight.Current, region) == false) return Face("sightLost", null, "Prism Sight can't see it on screen right now.");
        }
        return SlotAvailability.Go;
    }

    private static string ShortName(ContextPack p) => p.Name.Length <= 8 ? p.Name.ToUpperInvariant() : string.Concat(p.Name.Split(' ', StringSplitOptions.RemoveEmptyEntries).Select(w => char.IsDigit(w[0]) ? w : w[..1])).ToUpperInvariant();

    /// <summary>The pack's spectrum stop (stable per pack id; never the warn/neg stops 8 and 10).</summary>
    public static int HueFor(string packId)
    {
        int[] stops = [1, 3, 5, 7, 0, 2, 4, 6, 9, 11];
        var h = 2166136261u;
        foreach (var ch in packId) { h ^= ch; h *= 16777619u; }
        return stops[h % (uint)stops.Length];
    }

    // ================================================================== inspector, pins, status

    /// <summary>What a slot is now and why (the PI's inspector).</summary>
    public object Inspect(SmartSlot s)
    {
        lock (_gate)
        {
            var (pack, layout, state) = Snapshot(s);
            object? item = null;
            if (pack is not null)
            {
                if (s.IsKey)
                {
                    item = layout.KeyAt(s.Key) switch
                    {
                        VerbKey vk => new
                        {
                            kind = "verb", id = vk.Verb.Id, label = vk.Verb.Label, longLabel = vk.Verb.LongLabel, category = vk.Verb.Category.ToString().ToLowerInvariant(),
                            priority = vk.Verb.Priority, binding = Effective(vk.Verb).Describe(), bindingKind = Effective(vk.Verb).Kind,
                            fallback = !ReferenceEquals(Effective(vk.Verb), vk.Verb.Binding), safety = SafetyRules.Name(EffectiveSafety(vk.Verb)),
                            confidence = vk.Verb.Confidence, yourBind = vk.Verb.ReboundFrom is not null, packDefault = vk.Verb.ReboundFrom, why = vk.Why,
                            aiBound = vk.Verb.AiBound,
                            review = vk.Verb.PendingBinding is { } pb ? new { pack = PackOf(vk, pack).Id, chord = pb.Describe(), client = vk.Verb.PendingClient, at = vk.Verb.PendingAt } : null,
                            pinned = IsPinned(pack.Id, layout.DeviceKind, "key", s.Key.X, s.Key.Y, vk.Verb.Id),
                        },
                        MoreKey m => new { kind = "more", label = "MORE", page = m.Page + 1, pages = m.PageCount, why = m.Why },
                        ReadoutKey rk => (object)new { kind = "readout", id = rk.Readout.Id, label = rk.Readout.Label, why = rk.Why },
                        var e => new { kind = "empty", why = e.Why },
                    };
                }
                else
                {
                    var d = layout.DialAt(s.Dial);
                    item = new
                    {
                        kind = d.Control is null ? "readout" : "control", id = d.Control?.Id, label = d.Control?.Label, readout = d.Readout?.Id,
                        push = d.Control?.PushVerb, turn = d.Control is { } c ? $"{c.Turn.Left.Describe()} / {c.Turn.Right.Describe()}" : null, why = d.Why,
                        pinned = d.Control is not null && IsPinned(pack.Id, layout.DeviceKind, "dial", s.Dial.Dial, s.Dial.Layer, d.Control.Id),
                    };
                }
            }
            var view = View(s);
            return new
            {
                slot = s.ToString(),
                device = layout.DeviceKind,
                pack = pack is null ? null : new { id = pack.Id, name = pack.Name, version = pack.PackVersion, policy = pack.Policy.Class.ToString() },
                context = state.Context is null ? null : new { id = state.Context.Id, label = state.Context.Label },
                reason = state.Reason,
                since = state.Since == DateTimeOffset.MinValue ? null : state.Since.ToString("HH:mm:ss"),
                page = layout.Page + 1,
                pages = layout.PageCount,
                locked = Context.IsLocked,
                inFront = Context.IsAppInFront(),
                available = view.Availability.Ready,
                unavailable = view.Availability.Ready ? null : view.Availability.Hint,
                item,
            };
        }
    }

    private bool IsPinned(string packId, string device, string kind, int x, int y, string item) =>
        _prefs.For(packId).Pins.Any(p => p.Device == device && p.Kind == kind && p.X == x && p.Y == y && p.Item == item);

    /// <summary>Pins what this slot shows now to this slot (per app). Returns false when there is nothing to pin.</summary>
    public bool PinCurrent(SmartSlot s)
    {
        string? packId, item, device;
        int x, y;
        string kind;
        lock (_gate)
        {
            var (pack, layout, _) = Snapshot(s);
            packId = pack?.Id;
            device = layout.DeviceKind;
            if (s.IsKey) { item = (layout.KeyAt(s.Key) as VerbKey)?.Verb.Id; kind = "key"; x = s.Key.X; y = s.Key.Y; }
            else { item = layout.DialAt(s.Dial).Control?.Id; kind = "dial"; x = s.Dial.Dial; y = s.Dial.Layer; }
        }
        if (packId is null || item is null) return false;
        EditPreferences(p =>
        {
            if (!p.Apps.TryGetValue(packId, out var app) || app is null) p.Apps[packId] = app = new AppPreferences();
            app.Pins.RemoveAll(q => q.Device == device && q.Kind == kind && ((q.X == x && q.Y == y) || q.Item == item));
            app.Pins.Add(new SlotPin { Device = device, Kind = kind, X = x, Y = y, Item = item });
        });
        return true;
    }

    public bool UnpinSlot(SmartSlot s)
    {
        string? packId;
        string device, kind;
        int x, y;
        lock (_gate)
        {
            var (pack, layout, _) = Snapshot(s);
            packId = pack?.Id;
            device = layout.DeviceKind;
            (kind, x, y) = s.IsKey ? ("key", s.Key.X, s.Key.Y) : ("dial", s.Dial.Dial, s.Dial.Layer);
        }
        if (packId is null) return false;
        var removed = false;
        EditPreferences(p =>
        {
            if (p.Apps.TryGetValue(packId, out var app) && app is not null)
                removed = app.Pins.RemoveAll(q => q.Device == device && q.Kind == kind && q.X == x && q.Y == y) > 0;
        });
        return removed;
    }

    /// <summary>Hides what this slot shows now for this app (it never comes back until unhidden).</summary>
    public bool HideCurrent(SmartSlot s)
    {
        string? packId, item;
        lock (_gate)
        {
            var (pack, layout, _) = Snapshot(s);
            packId = pack?.Id;
            item = s.IsKey ? (layout.KeyAt(s.Key) as VerbKey)?.Verb.Id : layout.DialAt(s.Dial).Control?.Id;
        }
        if (packId is null || item is null) return false;
        EditPreferences(p =>
        {
            if (!p.Apps.TryGetValue(packId, out var app) || app is null) p.Apps[packId] = app = new AppPreferences();
            if (!app.Hidden.Contains(item)) app.Hidden.Add(item);
            app.Pins.RemoveAll(q => q.Item == item);
        });
        return true;
    }

    public void Unhide(string packId, string item) => EditPreferences(p =>
    {
        if (p.Apps.TryGetValue(packId, out var app) && app is not null) app.Hidden.RemoveAll(h => h == item);
    });

    public IReadOnlyList<string> HiddenFor(string packId) { lock (_gate) return [.. _prefs.For(packId).Hidden]; }

    public string? CurrentPackId => Context.Current.Pack?.Id;

    /// <summary>Engine status for the PI: context, pending switch, lock, devices, Sight, history.</summary>
    public object Status(IEnumerable<object>? packs = null, IEnumerable<object>? rebinds = null)
    {
        var state = Context.Current;
        object[] devices;
        lock (_gate)
            devices = [.. _devices.Values.Select(d => (object)new
            {
                name = d.Device.Name, kind = d.Geometry.Kind, page = d.Layout.Page + 1, pages = d.Layout.PageCount,
                keys = _slots.Values.Count(s => s.Device.Id == d.Device.Id && s.IsKey), dials = _slots.Values.Count(s => s.Device.Id == d.Device.Id && !s.IsKey),
            })];
        return new
        {
            enabled = Preferences.Enabled,
            app = state.App?.ProcessName,
            pack = state.Pack?.Id,
            context = state.Context?.Id,
            reason = state.Reason,
            pending = Context.PendingDescription,
            locked = Context.IsLocked,
            inFront = Context.IsAppInFront(),
            sight = _p.Sight.IsAvailable ? _p.Sight.Current.State.ToString().ToLowerInvariant() : "not installed",
            modules = _p.Verbs.Providers.Select(p => p.Module).ToArray(),
            devices,
            history = Context.History.TakeLast(12).Reverse().Select(e => e.ToString()).ToArray(),
            packs,
            rebinds,
        };
    }

    public void Dispose()
    {
        lock (_gate) _disposed = true;
        _regenTimer.Dispose();
        _liveTimer.Dispose();
        _graceTimer.Dispose();
        _p.Sight.Changed -= MarkLive;
        Fields.Changed -= MarkLive;
        _p.Foreground.Changed -= MarkLive;
        _p.Foreground.Changed -= OnForegroundChanged;
        Context.Dispose();
        _ = Executor.ReleaseAllAsync();
    }
}
