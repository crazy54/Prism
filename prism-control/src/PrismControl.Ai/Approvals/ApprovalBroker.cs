using System.Security.Cryptography;
using System.Text.Json.Nodes;
using PrismControl.Ai.Ingress;
using PrismControl.Ai.Platform;
using PrismControl.Ai.Sessions;
using PrismControl.Core.Hosting;

namespace PrismControl.Ai.Approvals;

public enum DecisionKind { None, Allow, Deny }

/// <summary>The decision frame sent back to the relay (platform/USAGE.md frame 4). Never anything but these keys.</summary>
public sealed record ApprovalDecision(DecisionKind Kind, string? Message = null, bool Interrupt = false)
{
    public const string DeniedMessage = "Denied from Stream Deck";
    public static readonly ApprovalDecision NoDecision = new(DecisionKind.None);

    public JsonObject ToFrame()
    {
        var o = new JsonObject { ["decision"] = Kind switch { DecisionKind.Allow => "allow", DecisionKind.Deny => "deny", _ => "none" } };
        if (Kind == DecisionKind.Deny)
        {
            o["message"] = Privacy.Clean(Message ?? DeniedMessage, 500);
            if (Interrupt) o["interrupt"] = true;
        }
        return o;
    }
}

public enum RequestStatus { Pending, Allowed, Denied, Withdrawn, TimedOut, Reviewed }

/// <summary>Why Approve is not available right now (shown on the key; also the outcome of a refused gesture).</summary>
public enum ApproveBlock
{
    None,
    NoRequest,
    SafeMode,
    PrivateMode,
    UnknownSession,
    DetailsHidden,
    TooSoon,
    MultiAction,
    DeviceDisconnected,
    NotDecidable,
    /// <summary>The shown request changed during the hold (a new selection, a dial turn, an expiry, a privacy switch).</summary>
    Changed,
    /// <summary>Released before the threshold.</summary>
    Released,
    Expired,
    /// <summary>What will run was not captured whole (review H1/M1): "REVIEW IN TERMINAL".</summary>
    ReviewInTerminal,
    /// <summary>Unicode format / control / unusual characters (review M3): "UNUSUAL CHARACTERS".</summary>
    UnusualCharacters,
    /// <summary>Complete, but it does not fit the details surface (review M2, measured): "TOO LONG".</summary>
    TooLong,
}

public enum HoldKind { Approve, Deny }

/// <summary>A key gesture bound to the request that was shown at keyDown (ai-apps.md §6.2).</summary>
public sealed class HoldTicket
{
    internal HoldTicket(HoldKind kind, string requestId, string context, string deviceId, long keyDownTimestamp, long generation)
    {
        Kind = kind;
        RequestId = requestId;
        Context = context;
        DeviceId = deviceId;
        KeyDownTimestamp = keyDownTimestamp;
        Generation = generation;
    }

    public HoldKind Kind { get; }
    public string RequestId { get; }
    public string Context { get; }
    public string DeviceId { get; }
    public long KeyDownTimestamp { get; }
    internal long Generation { get; }
    public bool Done { get; internal set; }
}

/// <summary>What the broker tells the ingress for one PermissionRequest (the ack frame).</summary>
public sealed record HoldOffer(bool Hold, bool Reveal, int DeadlineMs, string? RequestId, string Reason)
{
    /// <summary>The request's decision, bound at creation (never looked up later: a request can finish before anyone waits).</summary>
    public Task<ApprovalDecision> Decision { get; init; } = Task.FromResult(ApprovalDecision.NoDecision);

    public JsonObject ToFrame() => Hold
        ? new JsonObject { ["hold"] = true, ["reveal"] = Reveal, ["deadlineMs"] = DeadlineMs }
        : new JsonObject { ["hold"] = false };
}

/// <summary>A pending request as the deck may show it (privacy-projected by the caller).</summary>
public sealed record ApprovalView
{
    public required string Id { get; init; }
    public required SessionKey Session { get; init; }
    public required AgentKind Tool { get; init; }
    public required ToolCategory Category { get; init; }
    /// <summary>The tool name (e.g. "Bash", "mcp__example__query"): Reveal mode only.</summary>
    public string? ToolName { get; init; }
    public string? PermissionMode { get; init; }
    public required DateTimeOffset CreatedAt { get; init; }
    public required DateTimeOffset Deadline { get; init; }
    /// <summary>Reveal mode only, and only once the relay sent it.</summary>
    public RevealSummary? Summary { get; init; }
    /// <summary>A live source vouches for the session and the relay's ancestry contains the agent process.</summary>
    public required bool Known { get; init; }
    /// <summary>The summary arrived and may be shown (Reveal). Whether it can be shown in FULL is <see cref="Plan"/>.</summary>
    public required bool DetailsComplete { get; init; }
    /// <summary>
    /// What a details surface must show, and why it can't (Reveal only; <see cref="DetailsPlan.Hidden"/> otherwise): the display
    /// policy of <see cref="ApprovalText.Plan"/> (review H1/M1/M3/L2). Surfaces then measure whether <see cref="DetailsPlan.Text"/> fits.
    /// </summary>
    public DetailsPlan Plan { get; init; } = DetailsPlan.Hidden;
    /// <summary>A non-shell process between the relay and the agent (review L14), e.g. "python.exe": shown on the card.</summary>
    public string? Via { get; init; }
    public required int Index { get; init; }
    public required int Count { get; init; }
    public bool Unprotected => PermissionMode is "bypassPermissions" or "dontAsk";
}

/// <summary>
/// The approval broker: the ONLY place an allow can come from, and only through
/// <see cref="BeginApproveHold"/> → <see cref="CompleteApproveHold"/> (a physical keyDown on an Approve key, held to the
/// threshold). It enforces ai-apps.md §6:
/// <list type="number">
/// <item>never auto-approve: no approve-all, no permission writes, no allow from dials, touch, multi-actions, deep links, the
/// data API or the PI (none of those call into this class for an allow);</item>
/// <item>hold-to-approve (0.8–3 s, default 1.2 s), bound to the request shown at keyDown: a change of the shown request (new
/// selection, dial turn, expiry, its details, a privacy switch) aborts; a request must have been shown with full details for
/// ≥ 600 ms (+ a display-latency allowance) before keyDown;</item>
/// <item>informed: Approve only while what will run is FULLY and faithfully shown on the same device (lead decision 1:
/// <see cref="ApprovalText"/> decides completeness per tool category, the surface measures the fit), never in Private mode,
/// never for an unknown session;</item>
/// <item>Deny is a single press ("Denied from Stream Deck"); a held Deny adds interrupt (Claude only);</item>
/// <item>timeouts give no decision (the agent's own prompt takes over), or deny in Away mode; no hold at all without a visible
/// Approve key on a connected device, in safe mode, in Private mode (unless deny-only), with 8 requests pending, more than 3
/// pending or 10 a minute from one agent process (review L14), or while the PC is locked or the user is away (review M5).</item>
/// </list>
/// Thread-safe. Logs carry event types, 6-hex session hashes and decisions only.
/// </summary>
public sealed class ApprovalBroker : IDisposable
{
    public const int MaxPending = 8;
    /// <summary>Review L14: an agent process (and anything it spawns) may hold at most this many requests at once ...</summary>
    public const int MaxPendingPerProcess = 3;
    /// <summary>... and start at most this many holds per minute.</summary>
    public const int MaxHoldsPerProcessPerMinute = 10;
    public static readonly TimeSpan MinVisible = TimeSpan.FromMilliseconds(600);
    /// <summary>
    /// Review L4: a surface reports what it shows when it ENQUEUES the frame; the frame reaches the device a little later (cards
    /// render at the interactive priority while a request is pending). The 600 ms clock therefore starts this much after the report.
    /// </summary>
    public static readonly TimeSpan DisplayLatency = TimeSpan.FromMilliseconds(200);
    /// <summary>Our decision fires this long before the relay's own deadline so an Away-mode deny still arrives.</summary>
    public static readonly TimeSpan DeadlineMargin = TimeSpan.FromMilliseconds(500);

    private readonly object _gate = new();
    private readonly List<Request> _pending = [];
    private readonly Dictionary<string, Shown> _shown = new(StringComparer.Ordinal);
    private readonly Dictionary<string, Queue<DateTimeOffset>> _holdsByProcess = new(StringComparer.Ordinal);
    private readonly TimeProvider _time;
    private readonly ILog _log;
    private readonly DeckPresence _presence;
    private readonly AiSettingsService _settings;
    private readonly SessionTracker _tracker;
    private readonly IUserPresence? _user;
    private readonly bool _safeMode;
    private readonly Dictionary<string, Task<ApprovalDecision>> _finished = new(StringComparer.Ordinal);
    private string? _selectedId;
    private long _generation;
    private bool _wasPrivate;

    public ApprovalBroker(TimeProvider time, ILog log, DeckPresence presence, AiSettingsService settings, SessionTracker tracker, bool safeMode,
        IUserPresence? user = null)
    {
        _time = time;
        _log = log;
        _presence = presence;
        _settings = settings;
        _tracker = tracker;
        _safeMode = safeMode;
        _user = user;
        _wasPrivate = settings.Current.IsPrivate;
        // Review L13: presence changes (a key appearing on another page or device) and unrelated settings never void a hold or a
        // Deny press; the threshold re-validates the device, its details surface and Private mode anyway. Only what is SHOWN
        // changing bumps the generation: the selection, the selected request's details, a privacy switch.
        _presence.Changed += RaiseChanged;
        _settings.Changed += s =>
        {
            var priv = s.IsPrivate;
            bool flipped;
            lock (_gate)
            {
                flipped = priv != _wasPrivate;
                _wasPrivate = priv;
                if (flipped) _generation++;
            }
            RaiseChanged();
        };
    }

    /// <summary>Raised (outside the lock) whenever the pending set, the selection or anything a hold depends on changed.</summary>
    public event Action? Changed;

    public bool SafeMode => _safeMode;

    public int PendingCount { get { lock (_gate) return _pending.Count; } }

    // ------------------------------------------------------------------ ingress side

    /// <summary>Decides whether to hold a PermissionRequest (§6.5) and, if so, creates the request.</summary>
    public HoldOffer Offer(HookEvent e, bool known)
    {
        if (!e.CanBeDecided) return NoHold("not decidable");
        if (e.SessionId is null) return NoHold("no session");
        if (_safeMode) return NoHold("safe mode");
        var s = _settings.Current;
        if (!_presence.AppConnected) return NoHold("deck disconnected");
        if (Away(s) is { } away) return NoHold(away);
        var approveDevices = _presence.DevicesWith(SurfaceKind.Approve);
        if (approveDevices.Count == 0) return NoHold("no approve key visible");
        var priv = s.IsPrivate;
        if (priv)
        {
            if (!s.DenyOnlyInPrivate) return NoHold("private mode");
            if (!_presence.AnyVisible(SurfaceKind.Deny)) return NoHold("no deny key visible");
        }
        else if (!approveDevices.Overlaps(_presence.DevicesWith(SurfaceKind.Details)))
        {
            return NoHold("no details next to approve");
        }

        var window = s.RequestWindow;
        Request req;
        lock (_gate)
        {
            if (_pending.Count >= MaxPending) return NoHold("too many pending");
            var now = _time.GetUtcNow();
            var origin = OriginKey(e);
            if (_pending.Count(r => r.OriginKey == origin) >= MaxPendingPerProcess) return NoHold("too many pending from this agent process");
            if (!TakeHoldSlot(origin, now)) return NoHold("too many requests from this agent process");
            req = new Request
            {
                Id = Convert.ToHexStringLower(RandomNumberGenerator.GetBytes(16)),
                Session = new SessionKey(e.Tool, e.SessionId),
                Tool = e.Tool,
                ToolName = e.Fields.ToolName,
                Category = SessionStates.Categorize(e.Fields.ToolName, e.Fields.McpServer),
                PermissionMode = e.Fields.PermissionMode,
                CreatedAt = now,
                Deadline = now + window,
                Reveal = !priv,
                Known = known,
                InputIncomplete = !e.InputComplete,
                Via = e.Intermediary,
                OriginKey = origin,
            };
            _pending.Add(req);
            if (_selectedId is null) Select(req.Id);
            var due = window - DeadlineMargin;
            req.Timer = _time.CreateTimer(_ => OnDeadline(req.Id), null, due, Timeout.InfiniteTimeSpan);
        }
        _tracker.SetPendingRequest(req.Session, req.Id);
        _log.Info($"approval request for session {req.Session.Hash6} ({req.Category}): held {window.TotalSeconds:0} s, {(req.Reveal ? "reveal" : "private")}, {(known ? "known" : "UNKNOWN")} session{(req.InputIncomplete ? ", input incomplete" : "")}");
        RaiseChanged();
        return new HoldOffer(true, req.Reveal, (int)window.TotalMilliseconds, req.Id, "held") { Decision = req.Completion.Task };
    }

    private static HoldOffer NoHold(string reason) => new(false, false, 0, null, reason);

    /// <summary>
    /// Review M5 (ai-apps.md §6.5 "deck asleep"): no hold while the Windows session is locked, or when nobody touched the PC or a
    /// deck key for longer than the deck's sleep timeout (<see cref="AiSettings.AwayAfter"/>). Null = somebody is there.
    /// </summary>
    private string? Away(AiSettings s)
    {
        if (_user is null) return null;
        try
        {
            if (_user.SessionLocked) return "session locked";
            var after = s.AwayAfter;
            if (after <= TimeSpan.Zero) return null;
            var deckIdle = _presence.LastInput is { } last ? _time.GetUtcNow() - last : TimeSpan.MaxValue;
            return _user.IdleFor > after && deckIdle > after ? "user away" : null;
        }
        catch (Exception ex)
        {
            _log.Debug($"presence check failed: {ex.GetType().Name}");
            return null;
        }
    }

    /// <summary>The agent process the request came from (pid + creation time), else its session: the unit of the L14 limits.</summary>
    private static string OriginKey(HookEvent e) =>
        e.AgentProcess is { } p ? $"p:{p.Pid}:{p.StartedAtMs / 1000}" : $"s:{e.Tool}:{e.SessionId}";

    private bool TakeHoldSlot(string origin, DateTimeOffset now)
    {
        if (!_holdsByProcess.TryGetValue(origin, out var q))
        {
            if (_holdsByProcess.Count >= 256) _holdsByProcess.Clear();
            q = new Queue<DateTimeOffset>();
            _holdsByProcess[origin] = q;
        }
        while (q.Count > 0 && now - q.Peek() > TimeSpan.FromMinutes(1)) q.Dequeue();
        if (q.Count >= MaxHoldsPerProcessPerMinute) return false;
        q.Enqueue(now);
        return true;
    }

    /// <summary>
    /// Frame 3 (<c>{v:2, t:"reveal", summary:{…}}</c>), accepted only when this request asked for it. Scrubbed and bounded again
    /// here, whatever the relay did; the display plan (what can be shown in full) is decided once, here.
    /// </summary>
    public bool AttachSummary(string requestId, JsonNode? frame)
    {
        if (frame is not JsonObject o || RevealSummary.FromFrame(o) is not { } summary) return false;
        lock (_gate)
        {
            var req = _pending.FirstOrDefault(r => r.Id == requestId);
            if (req is null || !req.Reveal || req.Summary is not null) return false;
            req.Summary = summary;
            req.Plan = ApprovalText.Plan(req.ToolName ?? summary.Tool, req.Category, summary, req.InputIncomplete);
            if (_selectedId == req.Id) _generation++;
        }
        RaiseChanged();
        return true;
    }

    /// <summary>Completes with the decision (allow, deny, or none on timeout/withdrawal); also for requests that already finished.</summary>
    public Task<ApprovalDecision> WaitAsync(string requestId)
    {
        lock (_gate)
        {
            var req = _pending.FirstOrDefault(r => r.Id == requestId);
            if (req is not null) return req.Completion.Task;
            return _finished.TryGetValue(requestId, out var t) ? t : Task.FromResult(ApprovalDecision.NoDecision);
        }
    }

    /// <summary>The relay went away (the agent answered in its own prompt, or was cancelled): forget the request.</summary>
    public void Withdraw(string requestId, string reason) => Complete(requestId, ApprovalDecision.NoDecision, RequestStatus.Withdrawn, reason);

    private void OnDeadline(string requestId)
    {
        var away = _settings.Current.AwayDenyOnTimeout;
        Complete(requestId, away ? new ApprovalDecision(DecisionKind.Deny, ApprovalDecision.DeniedMessage + " (away: no answer in time)") : ApprovalDecision.NoDecision,
            RequestStatus.TimedOut, away ? "away-mode deny" : "timeout");
    }

    private bool Complete(string requestId, ApprovalDecision decision, RequestStatus status, string reason)
    {
        Request? req;
        lock (_gate)
        {
            req = _pending.FirstOrDefault(r => r.Id == requestId);
            if (req is null) return false;
            _pending.Remove(req);
            if (_finished.Count >= 64) _finished.Clear();
            _finished[req.Id] = req.Completion.Task;
            req.Status = status;
            req.Timer?.Dispose();
            if (_selectedId == req.Id) Select(_pending.FirstOrDefault()?.Id);
        }
        _tracker.SetPendingRequest(req.Session, null);
        req.Completion.TrySetResult(decision);
        _log.Info($"approval {req.Session.Hash6}: {decision.Kind.ToString().ToLowerInvariant()} ({reason})");
        RaiseChanged();
        return true;
    }

    /// <summary>Changes the selection (under the lock). The generation moves only when the shown request really changes.</summary>
    private void Select(string? id)
    {
        if (_selectedId == id) return;
        _selectedId = id;
        _generation++;
    }

    // ------------------------------------------------------------------ display

    /// <summary>The selected request, privacy-projected (null when nothing is pending).</summary>
    public ApprovalView? Selected()
    {
        lock (_gate)
        {
            var req = _pending.FirstOrDefault(r => r.Id == _selectedId);
            return req is null ? null : View(req);
        }
    }

    public IReadOnlyList<ApprovalView> Pending()
    {
        lock (_gate) return _pending.Select(View).ToList();
    }

    /// <summary>A dial turn on the card: next/previous pending request. Aborts any hold (the shown request changed).</summary>
    public void Select(int delta)
    {
        lock (_gate)
        {
            if (_pending.Count < 2 || delta == 0) return;
            var i = Math.Max(0, _pending.FindIndex(r => r.Id == _selectedId));
            i = ((i + Math.Sign(delta)) % _pending.Count + _pending.Count) % _pending.Count;
            Select(_pending[i].Id);
        }
        RaiseChanged();
    }

    /// <summary>
    /// A details surface reports what it shows right now (called each time it renders): the request, and whether its details are
    /// shown in full (<paramref name="shownLock"/> says why not, e.g. <see cref="DetailsLock.TooLong"/>). The "visible since"
    /// clock restarts whenever the request, its completeness or the device changes.
    /// </summary>
    public void ReportShown(string context, string deviceId, string? requestId, bool detailsComplete, DetailsLock shownLock = DetailsLock.None)
    {
        lock (_gate)
        {
            if (requestId is null) { _shown.Remove(context); return; }
            var lockState = detailsComplete ? DetailsLock.None : shownLock == DetailsLock.None ? DetailsLock.Hidden : shownLock;
            if (_shown.TryGetValue(context, out var cur) && cur.RequestId == requestId && cur.DetailsComplete == detailsComplete && cur.DeviceId == deviceId)
            {
                if (cur.Lock != lockState) _shown[context] = cur with { Lock = lockState };
                return;
            }
            _shown[context] = new Shown(deviceId, requestId, detailsComplete, lockState, _time.GetTimestamp());
        }
    }

    public void ReportHidden(string context)
    {
        lock (_gate) _shown.Remove(context);
    }

    /// <summary>Whether an Approve key on <paramref name="deviceId"/> could approve right now, and why not.</summary>
    public ApproveBlock ApproveState(string deviceId)
    {
        lock (_gate) return ApproveStateLocked(deviceId, _time.GetTimestamp());
    }

    private ApproveBlock ApproveStateLocked(string deviceId, long atTimestamp)
    {
        if (_safeMode) return ApproveBlock.SafeMode;
        var req = _pending.FirstOrDefault(r => r.Id == _selectedId);
        if (req is null) return ApproveBlock.NoRequest;
        if (_settings.Current.IsPrivate) return ApproveBlock.PrivateMode;
        if (!req.Known) return ApproveBlock.UnknownSession;
        if (req.Tool is not (AgentKind.Claude or AgentKind.Codex)) return ApproveBlock.NotDecidable;
        if (!_presence.IsDeviceConnected(deviceId)) return ApproveBlock.DeviceDisconnected;
        if (!req.Reveal || req.Summary is null) return ApproveBlock.DetailsHidden;
        // What will run, decided by the request itself (not by any surface): incomplete or unusual means never.
        switch (req.Plan.Lock)
        {
            case DetailsLock.Incomplete: return ApproveBlock.ReviewInTerminal;
            case DetailsLock.Unusual: return ApproveBlock.UnusualCharacters;
            case DetailsLock.Hidden: return ApproveBlock.DetailsHidden;
        }
        long? since = null;
        var tooLong = false;
        foreach (var s in _shown.Values)
        {
            if (s.DeviceId != deviceId || s.RequestId != req.Id) continue;
            if (s.DetailsComplete) since = since is null ? s.Since : Math.Min(since.Value, s.Since);
            else tooLong |= s.Lock == DetailsLock.TooLong;
        }
        if (since is null) return tooLong ? ApproveBlock.TooLong : ApproveBlock.DetailsHidden;
        var visibleFor = _time.GetElapsedTime(since.Value, atTimestamp) - DisplayLatency;
        return visibleFor < MinVisible ? ApproveBlock.TooSoon : ApproveBlock.None;
    }

    // ------------------------------------------------------------------ gestures (physical keys only)

    /// <summary>
    /// keyDown on an Approve key. Binds the gesture to the request shown at this moment; refuses if Approve is not
    /// available (including "shown for less than 600 ms": the press must come after the details).
    /// </summary>
    public (HoldTicket? Ticket, ApproveBlock Block) BeginApproveHold(string context, string deviceId, bool inMultiAction)
    {
        if (inMultiAction) return (null, ApproveBlock.MultiAction);
        lock (_gate)
        {
            var now = _time.GetTimestamp();
            var block = ApproveStateLocked(deviceId, now);
            if (block != ApproveBlock.None) return (null, block);
            return (new HoldTicket(HoldKind.Approve, _selectedId!, context, deviceId, now, _generation), ApproveBlock.None);
        }
    }

    /// <summary>The hold reached the threshold while the key is still down: re-validates everything, then allows.</summary>
    public ApproveBlock CompleteApproveHold(HoldTicket ticket)
    {
        string requestId;
        lock (_gate)
        {
            if (ticket.Kind != HoldKind.Approve || ticket.Done) return ApproveBlock.Released;
            ticket.Done = true;
            var now = _time.GetTimestamp();
            if (_time.GetElapsedTime(ticket.KeyDownTimestamp, now) < _settings.Current.HoldDuration) return ApproveBlock.Released;
            if (ticket.Generation != _generation) return ApproveBlock.Changed;
            var req = _pending.FirstOrDefault(r => r.Id == ticket.RequestId);
            if (req is null) return ApproveBlock.Expired;
            if (_selectedId != req.Id) return ApproveBlock.Changed;
            // The details must have been visible ≥ 600 ms before keyDown, and still be visible now.
            var atKeyDown = ApproveStateLocked(ticket.DeviceId, ticket.KeyDownTimestamp);
            if (atKeyDown != ApproveBlock.None) return atKeyDown;
            var stillVisible = ApproveStateLocked(ticket.DeviceId, now);
            if (stillVisible != ApproveBlock.None) return stillVisible;
            requestId = req.Id;
        }
        return Complete(requestId, new ApprovalDecision(DecisionKind.Allow), RequestStatus.Allowed, "approved on the deck") ? ApproveBlock.None : ApproveBlock.Expired;
    }

    /// <summary>The key went up before the threshold: the gesture is void.</summary>
    public void CancelHold(HoldTicket ticket)
    {
        lock (_gate) ticket.Done = true;
    }

    /// <summary>
    /// Approve: true while the ticket's request is still the shown, pending request and nothing shown changed. Deny: true while
    /// its request is pending (review L13: denying the request shown at keyDown is always what the press meant).
    /// </summary>
    public bool IsHoldValid(HoldTicket ticket)
    {
        lock (_gate)
            return !ticket.Done && _pending.Any(r => r.Id == ticket.RequestId) && (ticket.Kind == HoldKind.Deny || ticket.Generation == _generation);
    }

    /// <summary>keyDown on a Deny key: binds to the request shown now. Deny works in Private mode and for unknown sessions.</summary>
    public HoldTicket? BeginDeny(string context, string deviceId, bool inMultiAction)
    {
        if (inMultiAction || _safeMode) return null;
        lock (_gate)
        {
            if (_selectedId is null) return null;
            return new HoldTicket(HoldKind.Deny, _selectedId, context, deviceId, _time.GetTimestamp(), _generation);
        }
    }

    /// <summary>
    /// A press (keyUp) denies; a hold past the threshold denies with interrupt (Claude only; Codex reserves it). The request shown
    /// at keyDown is denied as long as it is still pending, whatever else changed meanwhile (review L13).
    /// </summary>
    public ApproveBlock CompleteDeny(HoldTicket ticket, bool interrupt)
    {
        string requestId;
        bool claude;
        lock (_gate)
        {
            if (ticket.Kind != HoldKind.Deny || ticket.Done) return ApproveBlock.Released;
            ticket.Done = true;
            var req = _pending.FirstOrDefault(r => r.Id == ticket.RequestId);
            if (req is null) return ApproveBlock.Expired;
            requestId = req.Id;
            claude = req.Tool == AgentKind.Claude;
        }
        var decision = new ApprovalDecision(DecisionKind.Deny, ApprovalDecision.DeniedMessage, Interrupt: interrupt && claude);
        return Complete(requestId, decision, RequestStatus.Denied, interrupt ? "denied + stop" : "denied") ? ApproveBlock.None : ApproveBlock.Expired;
    }

    /// <summary>
    /// Card push / touch: "review in terminal". Answers <c>none</c> right away so the agent's own prompt appears, and returns the
    /// session to jump to. Never an allow.
    /// </summary>
    public SessionKey? ReviewInTerminal()
    {
        string? id;
        SessionKey key;
        lock (_gate)
        {
            var req = _pending.FirstOrDefault(r => r.Id == _selectedId);
            if (req is null) return null;
            id = req.Id;
            key = req.Session;
        }
        Complete(id, ApprovalDecision.NoDecision, RequestStatus.Reviewed, "review in terminal");
        return key;
    }

    // ------------------------------------------------------------------ internals

    private ApprovalView View(Request r)
    {
        var reveal = !_settings.Current.IsPrivate && r.Reveal;
        return new ApprovalView
        {
            Id = r.Id,
            Session = r.Session,
            Tool = r.Tool,
            Category = r.Category,
            ToolName = reveal ? r.ToolName : null,
            PermissionMode = r.PermissionMode,
            CreatedAt = r.CreatedAt,
            Deadline = r.Deadline,
            Summary = reveal ? r.Summary : null,
            Known = r.Known,
            DetailsComplete = reveal && r.Summary is not null,
            Plan = reveal && r.Summary is not null ? r.Plan : DetailsPlan.Hidden,
            Via = r.Via,
            Index = _pending.IndexOf(r),
            Count = _pending.Count,
        };
    }

    private void RaiseChanged()
    {
        try { Changed?.Invoke(); }
        catch (Exception ex) { _log.Warn("an approval listener failed", ex); }
    }

    public void Dispose()
    {
        List<Request> all;
        lock (_gate) { all = [.. _pending]; }
        foreach (var r in all) Complete(r.Id, ApprovalDecision.NoDecision, RequestStatus.Withdrawn, "shutdown");
    }

    private sealed class Request
    {
        public required string Id { get; init; }
        public required SessionKey Session { get; init; }
        public required AgentKind Tool { get; init; }
        public string? ToolName { get; init; }
        public required ToolCategory Category { get; init; }
        public string? PermissionMode { get; init; }
        public required DateTimeOffset CreatedAt { get; init; }
        public required DateTimeOffset Deadline { get; init; }
        public required bool Reveal { get; init; }
        public required bool Known { get; init; }
        /// <summary>Frame 1 said stdin was truncated or did not parse (review H1): never approvable.</summary>
        public bool InputIncomplete { get; init; }
        public string? Via { get; init; }
        public required string OriginKey { get; init; }
        public RevealSummary? Summary { get; set; }
        public DetailsPlan Plan { get; set; } = DetailsPlan.Hidden;
        public RequestStatus Status { get; set; }
        public ITimer? Timer { get; set; }
        public TaskCompletionSource<ApprovalDecision> Completion { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
    }

    private sealed record Shown(string DeviceId, string RequestId, bool DetailsComplete, DetailsLock Lock, long Since);
}
