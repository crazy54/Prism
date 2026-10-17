using PrismControl.Ai.Ingress;
using PrismControl.Ai.Platform;
using PrismControl.Ai.Status;
using PrismControl.Core.Hosting;

namespace PrismControl.Ai.Sessions;

public enum PrivacyMode { Private, Reveal }

/// <summary>A change to the fleet: the transitions it contained (possibly none: a tool or slot changed).</summary>
public sealed record FleetUpdate(IReadOnlyList<SessionTransition> Transitions, long Version);

/// <summary>
/// The terminal-agnostic session table (research/ai-status.md §1). It merges, by session identity:
/// <list type="bullet">
/// <item>S1 hook events (observed; the state machine below);</item>
/// <item>S2 <c>claude agents --json</c> (reported; ground truth for the hooks' blind spots, e.g. Esc or a terminal deny);</item>
/// <item>S3 process exits with a pid + creation-time guard (observed: dead or ended);</item>
/// <item>S4 Codex rollout tails (reported);</item>
/// <item>S6 Orca (optional enrichment: pane handles only; it never creates a session or sets a state);</item>
/// <item>timeouts (inferred: stale, done → idle).</item>
/// </list>
/// Thread-safe. <see cref="Changed"/> is raised outside the lock; actions <c>Post</c> to their mailbox.
/// </summary>
public sealed class SessionTracker
{
    public static readonly TimeSpan WorkingTtl = TimeSpan.FromMinutes(15);
    public static readonly TimeSpan StaleAfter = TimeSpan.FromMinutes(10);
    public static readonly TimeSpan DoneFade = TimeSpan.FromMinutes(10);
    public static readonly TimeSpan EndedLinger = TimeSpan.FromSeconds(30);
    public static readonly TimeSpan DeadLinger = TimeSpan.FromMinutes(10);
    public static readonly TimeSpan StaleLinger = TimeSpan.FromMinutes(60);
    public static readonly TimeSpan RolloutQuiet = TimeSpan.FromMinutes(30);
    /// <summary>An agent-list snapshot only overrides a hook state when it was taken this long after the last hook event.</summary>
    public static readonly TimeSpan AgentListGrace = TimeSpan.FromSeconds(2);

    private readonly object _gate = new();
    private readonly Dictionary<SessionKey, SessionRecord> _records = new();
    private readonly SlotTable _slots;
    private readonly TimeProvider _time;
    private readonly ILog _log;
    private readonly IProcessWatcher? _watcher;
    private readonly IProcessTree? _tree;
    private long _version;
    private bool _retainTitles;

    public SessionTracker(TimeProvider time, ILog? log = null, SlotTable? slots = null, IProcessWatcher? watcher = null, IProcessTree? tree = null)
    {
        _time = time;
        _log = log ?? NullLog.Instance;
        _slots = slots ?? new SlotTable();
        _watcher = watcher;
        _tree = tree;
        if (_watcher is not null) _watcher.Exited += (id, at) => ApplyProcessExit(id, at);
    }

    public event Action<FleetUpdate>? Changed;

    public long Version { get { lock (_gate) return _version; } }

    /// <summary>
    /// Titles (the agent list's session names) are content: they are kept only while Reveal mode is on, and dropped the
    /// moment it turns off.
    /// </summary>
    public bool RetainTitles
    {
        get { lock (_gate) return _retainTitles; }
        set
        {
            lock (_gate)
            {
                _retainTitles = value;
                if (!value) foreach (var r in _records.Values) r.Title = null;
                _version++;
            }
            Raise([]);
        }
    }

    /// <summary>True while any session works or waits (the agent-list poller runs fast then).</summary>
    public bool AnyActive
    {
        get
        {
            lock (_gate) return _records.Values.Any(r => r.State.Value is SessionState.Working or SessionState.NeedsPermission or SessionState.NeedsInput);
        }
    }

    public bool AnyHooksActive { get { lock (_gate) return _records.Values.Any(r => r.HooksActive); } }

    // ------------------------------------------------------------------ S1: hooks

    /// <summary>
    /// Applies one hook event. <paramref name="processVerified"/>: the event's agent process is an ancestor of the pipe client
    /// (the relay), so it really came from that agent.
    /// </summary>
    public void ApplyHook(HookEvent e, bool processVerified)
    {
        if (e.SessionId is null) return;
        var transitions = new List<SessionTransition>();
        lock (_gate)
        {
            var key = new SessionKey(e.Tool == AgentKind.Unknown ? AgentKind.Claude : e.Tool, e.SessionId);
            if (!e.AncestryWalked && !_records.ContainsKey(key))
            {
                // A status event sent without the relay's ancestry walk (review L10) only refreshes a session an earlier event
                // identified: it never creates one, and it is filed under the one record with that session id when its tool tag
                // came out differently (no process chain to tell Cursor or Copilot apart).
                var same = _records.Keys.Where(k => k.Id == e.SessionId).Take(2).ToList();
                if (same.Count != 1) return;
                key = same[0];
            }
            var r = GetOrCreate(key, e.At, e.Origin, out var created);
            r.HooksActive = true;
            // Review M4: the relays of one session race (an async PreToolUse can land after the blocking PermissionRequest that
            // followed it). Events are ordered per session by the relay's own (clamped) time: an older one changes no state.
            var stale = !created && e.At < r.LastHookAt;
            if (e.At > r.LastHookAt) r.LastHookAt = e.At;
            r.LastSignal = Max(r.LastSignal, e.At);
            if (!stale)
            {
                r.Origin = e.Origin;
                if (e.Fields.PermissionMode is { } pm) r.PermissionMode = pm;
                if (e.Fields.CwdHash is { } ch) r.CwdHash = ch;
                if (e.Fields.CwdName is { } cn) r.CwdName = cn;
                BindHost(r, e);
            }
            BindProcess(r, e, processVerified);
            HookStateMachine.Apply(r, e, created, this, transitions, stale);
            if (r.State.Value is SessionState.Ended) r.OfflineAt ??= e.At;
            _version++;
        }
        Raise(transitions);
    }

    private void BindHost(SessionRecord r, HookEvent e)
    {
        var hostProc = e.Host?.Process;
        var kind = e.Host?.Kind ?? HostKind.Unknown;
        if (kind == HostKind.Unknown && r.Host.Kind != HostKind.Unknown) kind = r.Host.Kind;
        r.Host = new HostInfo(kind, hostProc ?? r.Host.Process, e.Host?.ConsoleHwnd is { } h && h != 0 ? h : r.Host.ConsoleWindow,
            e.Env.ContainsKey("WT_SESSION") || r.Host.HasWtSession, e.Env1("CLAUDE_CODE_ENTRYPOINT") ?? r.Host.Entrypoint,
            e.Env1("TERM_PROGRAM") ?? r.Host.TermProgram);
        var pane = e.Env1("ORCA_PANE_KEY");
        var handle = e.Env1("ORCA_TERMINAL_HANDLE");
        if (pane is not null || handle is not null)
            r.Orca = new OrcaLink(pane ?? r.Orca?.PaneKey, handle ?? r.Orca?.TerminalHandle, e.Env1("ORCA_WORKTREE_ID") ?? r.Orca?.WorktreeId,
                e.Env1("ORCA_TAB_ID") ?? r.Orca?.TabId, Confidence.Observed);
    }

    private void BindProcess(SessionRecord r, HookEvent e, bool verified)
    {
        if (e.AgentProcess is not { } p) return;
        if (r.Process is { } cur && cur.SameAs(p))
        {
            if (verified) r.ProcessVerified = true;
            return;
        }
        // A new process for this session (first sight, or a resumed session in a new process).
        if (r.Process is not null && !verified) return;   // an unverified claim never replaces a known process
        r.Process = p;
        r.ProcessVerified = verified;
        r.ProcessExited = false;
        if (_watcher?.Watch(p.Pid, p.StartedAtMs, p.Image) is null && _watcher is not null)
        {
            // Not running (or the pid was reused): the claim is stale.
            r.ProcessExited = true;
        }
    }

    // ------------------------------------------------------------------ S2: claude agents --json

    public void ApplyAgentList(AgentListSnapshot snap)
    {
        if (!snap.Ok) return;
        var transitions = new List<SessionTransition>();
        lock (_gate)
        {
            var seen = new HashSet<SessionKey>();
            foreach (var entry in snap.Entries.OrderBy(x => x.StartedAtMs ?? long.MaxValue))
            {
                if (entry.KeyId is not { } id) continue;
                var key = new SessionKey(AgentKind.Claude, id);
                seen.Add(key);
                var r = GetOrCreate(key, snap.ObservedAt, "claude", out var created, entry.StartedAtMs);
                r.ListedAt = snap.ObservedAt;
                r.ListedTtl = snap.Ttl;
                r.ListedDir = snap.ConfigDir;
                r.ListedLive = entry.Status is not null;
                r.IsBackground = entry.IsBackground;
                r.LastSignal = Max(r.LastSignal, snap.ObservedAt);
                if (entry.CwdHash is { } ch) r.CwdHash = ch;
                if (entry.CwdName is { } cn) r.CwdName = cn;
                if (_retainTitles) r.Title = entry.Title;
                if (entry.StartedAtMs is { } st && r.StartedAtMs == 0) r.StartedAtMs = st;
                if (entry.Pid is { } pid && (r.Process is not { } cur || cur.Pid != pid))
                {
                    var identity = _watcher?.Watch(pid, 0, "claude.exe") ?? _tree?.Identity(pid) ?? new ProcessIdentity(pid, 0, "claude.exe");
                    r.Process = identity;
                    r.ProcessExited = false;
                }
                ApplyListedState(r, entry, snap, created, transitions);
            }
            // Sessions this config dir listed before and no longer lists.
            foreach (var r in _records.Values)
            {
                if (r.ListedDir != snap.ConfigDir || seen.Contains(r.Key) || r.Offline) continue;
                if (r.ListedAt is not { } at || at >= snap.ObservedAt) continue;
                r.ListedLive = false;
                // Without hooks (or without a process to watch) the agent list is the only witness: gone means ended.
                if (!r.HooksActive || r.Process is null || r.IsBackground)
                    SetState(r, SessionState.Ended, Confidence.Reported, FactSource.AgentList, snap.ObservedAt, TimeSpan.Zero, transitions);
            }
            _version++;
        }
        Raise(transitions);
    }

    private void ApplyListedState(SessionRecord r, AgentListEntry entry, AgentListSnapshot snap, bool created, List<SessionTransition> tr)
    {
        SessionState? desired;
        string? waitingFor = null;
        if (entry.IsBackground && entry.BackgroundState is { } bg)
        {
            desired = bg.ToLowerInvariant() switch
            {
                "working" => SessionState.Working,
                "blocked" => entry.WaitingFor is "permission prompt" ? SessionState.NeedsPermission : SessionState.NeedsInput,
                "done" => SessionState.Done,
                "failed" => SessionState.Error,
                "stopped" => SessionState.Ended,
                _ => null,
            };
            waitingFor = entry.WaitingFor;
        }
        else
        {
            desired = entry.Status?.ToLowerInvariant() switch
            {
                "busy" => SessionState.Working,
                "waiting" when entry.WaitingFor is "permission prompt" => SessionState.NeedsPermission,
                "waiting" => SessionState.NeedsInput,
                "idle" => r.State.Value is SessionState.Working or SessionState.NeedsPermission or SessionState.NeedsInput ? SessionState.Done
                    : created ? SessionState.Idle
                    : r.State.Value is SessionState.Done or SessionState.Error or SessionState.Idle ? r.State.Value
                    : SessionState.Idle,
                _ => null,
            };
            if (entry.Status is "waiting") waitingFor = entry.WaitingFor;
        }
        if (desired is not { } d) return;
        // A hook event newer than (or about as new as) this snapshot wins: the agent list can lag the hooks.
        if (r.HooksActive && snap.ObservedAt - r.LastHookAt < AgentListGrace) return;
        // While Prism holds a permission request for this session, the dialog may not be drawn yet: keep NeedsPermission.
        if (r.PendingRequestId is not null && r.State.Value == SessionState.NeedsPermission) return;
        if (d == SessionState.Error && r.State.Value == SessionState.Error) return;
        r.WaitingFor = waitingFor;
        var fact = Fact<SessionState>.Reported(d, FactSource.AgentList, snap.ObservedAt, snap.Ttl);
        if (r.State.Value == d && !created)
        {
            r.State = Facts.Pick(r.State, fact, snap.ObservedAt);
            return;
        }
        // A freshly seeded session: we don't know when its state began ("at least since").
        SetState(r, d, Confidence.Reported, FactSource.AgentList, snap.ObservedAt, snap.Ttl, tr, sinceConfidence: created ? Confidence.Inferred : Confidence.Reported);
    }

    // ------------------------------------------------------------------ S3: process exits

    public void ApplyProcessExit(ProcessIdentity id, DateTimeOffset at)
    {
        var transitions = new List<SessionTransition>();
        lock (_gate)
        {
            foreach (var r in _records.Values)
            {
                if (r.Process is not { } p || !p.SameAs(id) || r.ProcessExited) continue;
                r.ProcessExited = true;
                if (r.IsBackground || r.Offline) continue;
                // Hooks were active and no SessionEnd came: the session ended unexpectedly.
                var to = r.HooksActive ? SessionState.Dead : SessionState.Ended;
                SetState(r, to, Confidence.Observed, FactSource.Process, at, TimeSpan.Zero, transitions);
            }
            _version++;
        }
        Raise(transitions);
    }

    // ------------------------------------------------------------------ S4: Codex rollouts

    public void ApplyRollout(RolloutEvent e)
    {
        var transitions = new List<SessionTransition>();
        lock (_gate)
        {
            var key = new SessionKey(AgentKind.Codex, e.ThreadId);
            var r = GetOrCreate(key, e.At, "codex", out var created);
            r.RolloutAt = Max(r.RolloutAt ?? DateTimeOffset.MinValue, e.At);
            r.LastSignal = Max(r.LastSignal, e.At);
            if (e.CwdHash is { } ch) r.CwdHash = ch;
            if (e.CwdName is { } cn) r.CwdName = cn;
            if (e.Originator is { } o && o.Contains("desktop", StringComparison.OrdinalIgnoreCase) && r.Host.Kind == HostKind.Unknown)
                r.Host = r.Host with { Kind = HostKind.ChatGpt };
            SessionState? to = e.Kind switch
            {
                RolloutKind.TaskStarted => SessionState.Working,
                RolloutKind.TaskComplete => e.HasError ? SessionState.Error : SessionState.Done,
                RolloutKind.TurnAborted => SessionState.Done,
                _ => created ? SessionState.Idle : null,
            };
            var hookFresher = r.HooksActive && e.At - r.LastHookAt < AgentListGrace && e.Kind != RolloutKind.TaskComplete;
            if (to is { } s && !hookFresher && !(r.PendingRequestId is not null && r.State.Value == SessionState.NeedsPermission))
            {
                if (s == SessionState.Error) r.ErrorKind = "error";
                SetState(r, s, Confidence.Reported, FactSource.Rollout, e.At, TimeSpan.Zero, transitions);
            }
            _version++;
        }
        Raise(transitions);
    }

    // ------------------------------------------------------------------ S6: Orca (enrichment only)

    public void ApplyOrca(OrcaSnapshot snap)
    {
        lock (_gate)
        {
            var terminalsByPane = snap.Terminals.Where(t => t.PaneKey is not null).GroupBy(t => t.PaneKey!).ToDictionary(g => g.Key, g => g.First());
            foreach (var r in _records.Values)
            {
                if (r.Orca?.PaneKey is { } pane)
                {
                    // Exact join through the relay's ORCA_PANE_KEY: refresh the terminal handle (handles change).
                    if (terminalsByPane.TryGetValue(pane, out var t)) r.Orca = r.Orca with { TerminalHandle = t.Handle };
                    var agent = snap.Agents.FirstOrDefault(a => a.PaneKey == pane);
                    if (agent?.ToolName is { } tool && !r.Tool.IsKnown)
                        r.Tool = Fact<ToolCategory>.Reported(SessionStates.Categorize(tool), FactSource.Orca, snap.ObservedAt, TimeSpan.FromSeconds(30));
                    continue;
                }
                // Inferred join by cwd: only when exactly one Orca agent and exactly one session share the workspace.
                if (r.CwdHash is not { } ch || r.Offline) continue;
                var candidates = snap.Agents.Where(a => a.WorktreePathHash == ch).ToList();
                if (candidates.Count != 1) continue;
                if (_records.Values.Count(o => o.CwdHash == ch && !o.Offline) != 1) continue;
                var c = candidates[0];
                terminalsByPane.TryGetValue(c.PaneKey, out var term);
                r.Orca = new OrcaLink(c.PaneKey, term?.Handle, c.WorktreeId, term?.TabId, Confidence.Inferred);
            }
            _version++;
        }
        Raise([]);
    }

    // ------------------------------------------------------------------ approvals

    /// <summary>Marks (or clears) the Prism approval request pending for a session.</summary>
    public void SetPendingRequest(SessionKey key, string? requestId)
    {
        lock (_gate)
        {
            if (!_records.TryGetValue(key, out var r)) return;
            if (requestId is null && r.PendingRequestId is null) return;
            r.PendingRequestId = requestId;
            _version++;
        }
        Raise([]);
    }

    /// <summary>
    /// ai-apps.md §6.3: is this session vouched for by a live source right now? True when the agent list lists it (fresh),
    /// or an earlier hook event was verified (its agent process is an ancestor of the relay) and that process still runs.
    /// A different process claiming the session makes it unknown.
    /// </summary>
    public bool IsKnownLive(SessionKey key, ProcessIdentity? claimed)
    {
        lock (_gate)
        {
            if (!_records.TryGetValue(key, out var r) || r.Offline) return false;
            if (claimed is { } c && r.Process is { } p && !p.SameAs(c)) return false;
            var now = _time.GetUtcNow();
            var listed = r.ListedLive && r.ListedAt is { } at && now - at <= Max(r.ListedTtl, TimeSpan.FromSeconds(6));
            var verified = r.ProcessVerified && r.Process is not null && !r.ProcessExited;
            return listed || verified;
        }
    }

    // ------------------------------------------------------------------ timeouts

    /// <summary>Applies the timeout rules (ai-status.md §1.3). Call about once a second.</summary>
    public void Tick()
    {
        var now = _time.GetUtcNow();
        var transitions = new List<SessionTransition>();
        var changed = false;
        lock (_gate)
        {
            bool? codexRunning = null;
            foreach (var r in _records.Values.ToList())
            {
                var s = r.State.Value;
                var listedNow = r.ListedLive && r.ListedAt is { } la && now - la <= Max(r.ListedTtl, TimeSpan.FromSeconds(6));
                if (s == SessionState.Working && !listedNow && now - r.LastSignal > StaleAfter && r.RolloutAt is null)
                {
                    SetState(r, SessionState.Stale, Confidence.Inferred, FactSource.Heuristic, now, TimeSpan.Zero, transitions, sinceAt: r.LastSignal);
                    changed = true;
                }
                else if (s == SessionState.Done && now - r.Since.Value > DoneFade)
                {
                    SetState(r, SessionState.Idle, Confidence.Inferred, FactSource.Heuristic, now, TimeSpan.Zero, transitions);
                    changed = true;
                }
                else if (r.RolloutAt is { } ra && !r.HooksActive && !listedNow && now - ra > RolloutQuiet
                         && s is not (SessionState.Idle or SessionState.Stale or SessionState.Ended or SessionState.Dead))
                {
                    codexRunning ??= _tree?.AnyRunning("codex.exe") ?? false;
                    SetState(r, codexRunning.Value ? SessionState.Idle : SessionState.Stale, Confidence.Inferred, FactSource.Heuristic, now, TimeSpan.Zero, transitions);
                    changed = true;
                }

                var linger = r.State.Value switch
                {
                    SessionState.Ended => EndedLinger,
                    SessionState.Dead => DeadLinger,
                    SessionState.Stale => StaleLinger,
                    _ => (TimeSpan?)null,
                };
                // Stale counts from when it became stale (its "since" is the last signal, for the "no signal for" label).
                var from = r.State.Value == SessionState.Stale ? r.State.ObservedAt : r.OfflineAt ?? r.Since.Value;
                if (linger is { } l && now - from > l)
                {
                    _records.Remove(r.Key);
                    _slots.MarkOffline(r.Key, r.OfflineAt ?? now);
                    changed = true;
                }
            }
            _slots.Release(now, k => _records.ContainsKey(k));
            if (changed) _version++;
        }
        if (changed) Raise(transitions);
    }

    // ------------------------------------------------------------------ views

    public IReadOnlyList<SessionView> Snapshot(PrivacyMode privacy)
    {
        lock (_gate) return _records.Values.Select(r => View(r, privacy)).OrderBy(v => v.Slot).ToList();
    }

    public SessionView? Find(SessionKey key, PrivacyMode privacy)
    {
        lock (_gate) return _records.TryGetValue(key, out var r) ? View(r, privacy) : null;
    }

    public SessionView? BySlot(int slot, PrivacyMode privacy)
    {
        lock (_gate) return _slots.KeyIn(slot) is { } k && _records.TryGetValue(k, out var r) ? View(r, privacy) : null;
    }

    /// <summary>The oldest session in NeedsPermission, then NeedsInput, then Error (the "Next needs me" target).</summary>
    public SessionView? NextNeedsMe(PrivacyMode privacy)
    {
        lock (_gate)
            return _records.Values.Select(r => View(r, privacy)).Where(v => v.NeedsYou)
                .OrderBy(v => v.NeedsYouRank).ThenBy(v => v.Since.Value).ThenBy(v => v.Slot).FirstOrDefault();
    }

    /// <summary>Pins the session shown in <paramref name="slot"/> to it (true), or unpins it if pinned (false). Null: empty slot.</summary>
    public bool? TogglePin(int slot)
    {
        bool result;
        lock (_gate)
        {
            if (_slots.KeyIn(slot) is not { } k) return null;
            result = _slots.IsPinned(k) ? !_slots.Unpin(k) : _slots.Pin(k, slot);
            _version++;
        }
        Raise([]);
        return result;
    }

    private SessionView View(SessionRecord r, PrivacyMode privacy)
    {
        var slot = _slots.SlotOf(r.Key) ?? 0;
        var reveal = privacy == PrivacyMode.Reveal;
        var title = reveal ? r.Title : null;
        var workspace = reveal ? r.CwdName : null;
        var now = _time.GetUtcNow();
        var listed = r.ListedLive && r.ListedAt is { } la && now - la <= Max(r.ListedTtl, TimeSpan.FromSeconds(6));
        return new SessionView
        {
            Key = r.Key,
            Origin = r.Origin,
            Slot = slot,
            Alias = reveal && (title ?? workspace) is { } name ? name : $"AGENT {slot}",
            Pinned = _slots.IsPinned(r.Key),
            State = r.State,
            Since = r.Since,
            Tool = r.Tool,
            Subagents = Fact<int>.Observed(r.Subagents, FactSource.Hook, r.LastHookAt, TimeSpan.Zero) with { Confidence = r.HooksActive ? Confidence.Observed : Confidence.Unknown },
            PermissionMode = r.PermissionMode,
            ErrorKind = r.ErrorKind,
            WaitingFor = r.WaitingFor,
            Process = r.Process,
            Host = r.Host,
            Orca = r.Orca,
            Title = title,
            Workspace = workspace,
            CwdHash = r.CwdHash,
            FirstSeen = r.FirstSeen,
            LastSignal = r.LastSignal,
            KnownLive = !r.Offline && (listed || (r.ProcessVerified && r.Process is not null && !r.ProcessExited)),
            HooksActive = r.HooksActive,
            PendingRequestId = r.PendingRequestId,
        };
    }

    // ------------------------------------------------------------------ internals

    private SessionRecord GetOrCreate(SessionKey key, DateTimeOffset at, string origin, out bool created, long? startedAtMs = null)
    {
        if (_records.TryGetValue(key, out var r)) { created = false; return r; }
        created = true;
        r = new SessionRecord(key, origin, at) { StartedAtMs = startedAtMs ?? at.ToUnixTimeMilliseconds() };
        _records[key] = r;
        _slots.Assign(_records.Values.Where(x => !x.Offline).OrderBy(x => x.StartedAtMs).Select(x => x.Key).ToList());
        _slots.MarkOnline(key);
        _log.Debug($"session {key} seen ({origin})");
        return r;
    }

    internal void SetState(SessionRecord r, SessionState to, Confidence confidence, FactSource source, DateTimeOffset at, TimeSpan ttl,
        List<SessionTransition> transitions, DateTimeOffset? sinceAt = null, Confidence? sinceConfidence = null)
    {
        var from = r.Created ? (SessionState?)null : r.State.Value;
        r.Created = false;
        var stateTtl = ttl == TimeSpan.Zero && to == SessionState.Working && source == FactSource.Hook ? WorkingTtl : ttl;
        r.State = new Fact<SessionState>(to, source, confidence, at, stateTtl);
        if (from == to) return;
        r.Since = new Fact<DateTimeOffset>(sinceAt ?? at, source, sinceConfidence ?? confidence, at, TimeSpan.Zero);
        if (to != SessionState.Error) r.ErrorKind = null;
        if (to is not (SessionState.NeedsInput or SessionState.NeedsPermission)) r.WaitingFor = null;
        if (to is SessionState.Ended or SessionState.Dead)
        {
            r.OfflineAt = at;
            _slots.MarkOffline(r.Key, at);
        }
        else if (from is SessionState.Ended or SessionState.Dead)
        {
            r.OfflineAt = null;
            _slots.MarkOnline(r.Key);
        }
        transitions.Add(new SessionTransition(r.Key, _slots.SlotOf(r.Key) ?? 0, from, to, at));
    }

    private void Raise(IReadOnlyList<SessionTransition> transitions)
    {
        long v;
        lock (_gate) v = _version;
        try { Changed?.Invoke(new FleetUpdate(transitions, v)); }
        catch (Exception ex) { _log.Warn("a fleet listener failed", ex); }
    }

    private static DateTimeOffset Max(DateTimeOffset a, DateTimeOffset b) => a > b ? a : b;
    private static TimeSpan Max(TimeSpan a, TimeSpan b) => a > b ? a : b;
}

/// <summary>The tracker's mutable row (under the tracker's lock only).</summary>
internal sealed class SessionRecord(SessionKey key, string origin, DateTimeOffset firstSeen)
{
    public SessionKey Key { get; } = key;
    public string Origin { get; set; } = origin;
    public bool Created { get; set; } = true;
    public Fact<SessionState> State { get; set; } = new(SessionState.Idle, FactSource.None, Confidence.Unknown, firstSeen, TimeSpan.Zero);
    public Fact<DateTimeOffset> Since { get; set; } = new(firstSeen, FactSource.None, Confidence.Unknown, firstSeen, TimeSpan.Zero);
    public Fact<ToolCategory> Tool { get; set; } = Fact<ToolCategory>.Unknown;
    public int Subagents { get; set; }
    public string? PermissionMode { get; set; }
    public string? ErrorKind { get; set; }
    public string? WaitingFor { get; set; }
    public SessionState? BeforeCompact { get; set; }
    public DateTimeOffset FirstSeen { get; } = firstSeen;
    public DateTimeOffset LastSignal { get; set; } = firstSeen;
    public DateTimeOffset LastHookAt { get; set; } = DateTimeOffset.MinValue;
    public bool HooksActive { get; set; }
    public DateTimeOffset? ListedAt { get; set; }
    public TimeSpan ListedTtl { get; set; } = TimeSpan.FromSeconds(6);
    public string? ListedDir { get; set; }
    public bool ListedLive { get; set; }
    public bool IsBackground { get; set; }
    public ProcessIdentity? Process { get; set; }
    public bool ProcessVerified { get; set; }
    public bool ProcessExited { get; set; }
    public HostInfo Host { get; set; } = HostInfo.Unknown;
    public OrcaLink? Orca { get; set; }
    public string? CwdHash { get; set; }
    public string? CwdName { get; set; }
    public string? Title { get; set; }
    public long StartedAtMs { get; set; }
    public DateTimeOffset? OfflineAt { get; set; }
    public DateTimeOffset? RolloutAt { get; set; }
    public string? PendingRequestId { get; set; }
    public bool Offline => State.Value is SessionState.Ended or SessionState.Dead;
}
