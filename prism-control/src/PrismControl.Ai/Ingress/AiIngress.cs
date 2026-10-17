using System.Text.Json.Nodes;
using PrismControl.Ai.Approvals;
using PrismControl.Ai.Platform;
using PrismControl.Ai.Sessions;
using PrismControl.Core.Hosting;

namespace PrismControl.Ai.Ingress;

/// <summary>Counters for the PI and logs (no payloads, ever).</summary>
public sealed class IngressStats
{
    private long _events, _rejected, _limited, _holds, _verified;
    public long Events => Interlocked.Read(ref _events);
    public long Rejected => Interlocked.Read(ref _rejected);
    public long RateLimited => Interlocked.Read(ref _limited);
    public long Holds => Interlocked.Read(ref _holds);
    public long Verified => Interlocked.Read(ref _verified);
    public DateTimeOffset? LastEventAt { get; internal set; }
    internal void Event() => Interlocked.Increment(ref _events);
    internal void Reject() => Interlocked.Increment(ref _rejected);
    internal void Limit() => Interlocked.Increment(ref _limited);
    internal void Hold() => Interlocked.Increment(ref _holds);
    internal void Verify() => Interlocked.Increment(ref _verified);
}

/// <summary>
/// Handles relay connections on the <c>ai</c> pipe (platform/USAGE.md "AI hook frames"):
/// <list type="number">
/// <item>frame 1 (token already checked): re-validated against the event allow-list and minimized again
/// (<see cref="HookEventParser"/>); rate-limited (100/s overall, 20/s per session);</item>
/// <item>the pipe client must be our relay binary, and the agent process it claims must be in the client's real ancestry
/// (pid + creation time); otherwise the event is display-only and its session is never approvable;</item>
/// <item>frame 2, within 300 ms: <c>{ok:true}</c>, or for PermissionRequest the broker's <c>{hold:false}</c> /
/// <c>{hold:true, reveal, deadlineMs}</c>;</item>
/// <item>frame 3 (only after <c>reveal:true</c>): the bounded summary;</item>
/// <item>frame 4: the decision. The relay never decides anything: any further frame from it, or its disappearance, withdraws
/// the request (decisions only flow Prism → relay, as the reply to that relay's own request).</item>
/// </list>
/// <para><b>What "verified" really guarantees (review L14).</b> The client's image path is our relay (a user-writable folder:
/// trust is by path, not by signature) and the claimed agent process is in the client's real ancestry. That proves the event came
/// from somewhere INSIDE that agent's process tree, which includes every tool command the agent runs: a prompt-injected command
/// can start the real relay with a forged payload and get a card for its own session. Such a card can only ever answer that
/// forged relay (decisions are bound to the connection), never the agent's real request. Mitigations: at most
/// <see cref="ApprovalBroker.MaxPendingPerProcess"/> pending and <see cref="ApprovalBroker.MaxHoldsPerProcessPerMinute"/> holds a
/// minute per agent process, and the card names any non-shell process between the relay and the agent ("VIA PYTHON.EXE").</para>
/// Frames of the current protocol (v2) and the previous one (v1, a relay copy not yet refreshed: review M6) are accepted; v1 reveal
/// summaries are never approvable. Logs carry event names, 6-hex session hashes and decisions only.
/// </summary>
public sealed class AiIngress
{
    public static readonly TimeSpan RevealTimeout = TimeSpan.FromSeconds(1);

    private readonly SessionTracker _tracker;
    private readonly ApprovalBroker _broker;
    private readonly IProcessTree _tree;
    private readonly TimeProvider _time;
    private readonly ILog _log;
    private readonly IngressLimits _limits;
    private readonly Func<string?, bool> _trustedClient;

    /// <param name="trustedClientImage">
    /// Whether the pipe client's image is our relay (production: RelayInstaller.IsOurCommand). Events from any other client
    /// are applied as display-only signals: never verified, so their sessions can never be approved.
    /// </param>
    public AiIngress(SessionTracker tracker, ApprovalBroker broker, IProcessTree tree, TimeProvider time, ILog log,
        Func<string?, bool> trustedClientImage, IngressLimits? limits = null)
    {
        _trustedClient = trustedClientImage;
        _tracker = tracker;
        _broker = broker;
        _tree = tree;
        _time = time;
        _log = log;
        _limits = limits ?? new IngressLimits(time);
    }

    public IngressStats Stats { get; } = new();

    /// <summary>Raised for every accepted event (after it was applied), for "connected" status in the PI.</summary>
    public event Action<HookEvent>? EventAccepted;

    public async Task HandleAsync(IIngressConnection c, CancellationToken ct)
    {
        if (!_limits.AllowGlobal())
        {
            Stats.Limit();
            await TryWriteAsync(c, new JsonObject { ["hold"] = false }, ct).ConfigureAwait(false);
            return;
        }
        var e = HookEventParser.TryParseHello(c.Hello, _time.GetUtcNow(), out var reject);
        if (e is null)
        {
            Stats.Reject();
            _log.Debug($"hook frame rejected: {reject}");
            await TryWriteAsync(c, new JsonObject { ["ok"] = false }, ct).ConfigureAwait(false);
            return;
        }
        if (!_limits.AllowSession(e.SessionId))
        {
            Stats.Limit();
            await TryWriteAsync(c, new JsonObject { ["hold"] = false }, ct).ConfigureAwait(false);
            return;
        }
        Stats.Event();
        Stats.LastEventAt = e.At;

        // Review L10: the ancestry check below walks the client's parents link by link (Win32ProcessTree, ≈ 0.5 ms instead of a
        // ≈ 60 ms process snapshot), so the ack still follows the state update (an acked event is an applied one).
        var verified = _trustedClient(c.ClientImagePath) && Verify(e, c.ClientPid);
        if (verified) Stats.Verify();
        var key = new SessionKey(e.Tool == AgentKind.Unknown ? AgentKind.Claude : e.Tool, e.SessionId ?? "");
        // "Known" is decided BEFORE this event is applied: the request itself never vouches for its own session.
        var known = verified && e.SessionId is not null && _tracker.IsKnownLive(key, e.AgentProcess);
        _tracker.ApplyHook(e, verified);
        try { EventAccepted?.Invoke(e); } catch (Exception ex) { _log.Warn("an ingress listener failed", ex); }
        _log.Debug($"hook {e.Origin}/{e.Name} session {Privacy.Hash6(e.SessionId)}{(verified ? "" : " (unverified)")}");

        if (e.Kind != HookKind.PermissionRequest)
        {
            await TryWriteAsync(c, new JsonObject { ["ok"] = true }, ct).ConfigureAwait(false);
            return;
        }

        var offer = _broker.Offer(e, known);
        if (!await TryWriteAsync(c, offer.ToFrame(), ct).ConfigureAwait(false))
        {
            if (offer.RequestId is { } lost) _broker.Withdraw(lost, "ack failed");
            return;
        }
        if (!offer.Hold || offer.RequestId is not { } id) return;
        Stats.Hold();

        try
        {
            if (offer.Reveal)
            {
                using var revealCts = CancellationTokenSource.CreateLinkedTokenSource(ct);
                revealCts.CancelAfter(RevealTimeout);
                JsonNode? frame;
                try { frame = await c.ReadAsync(revealCts.Token).ConfigureAwait(false); }
                catch (OperationCanceledException) when (!ct.IsCancellationRequested) { frame = null; }
                if (frame is null || !_broker.AttachSummary(id, frame))
                {
                    // No details arrived: Approve could never be informed. Let the agent's own prompt take over now.
                    // (If the request already finished, e.g. its deadline passed first, the relay still gets that decision.)
                    _broker.Withdraw(id, "no details from the relay");
                    await TryWriteAsync(c, (await offer.Decision.ConfigureAwait(false)).ToFrame(), ct).ConfigureAwait(false);
                    return;
                }
            }

            using var waitCts = CancellationTokenSource.CreateLinkedTokenSource(ct);
            var decisionTask = offer.Decision;
            var readTask = c.ReadAsync(waitCts.Token);
            var first = await Task.WhenAny(decisionTask, readTask).ConfigureAwait(false);
            if (first == readTask)
            {
                // EOF (the hook was cancelled: the user answered in the terminal) or a frame the protocol never allows.
                var why = readTask.IsCompletedSuccessfully && readTask.Result is not null ? "unexpected frame from the relay" : "relay gone";
                _broker.Withdraw(id, why);
                if (why != "relay gone") Stats.Reject();
            }
            var decision = await decisionTask.ConfigureAwait(false);
            waitCts.Cancel();
            await TryWriteAsync(c, decision.ToFrame(), ct).ConfigureAwait(false);
            try { await readTask.ConfigureAwait(false); } catch (Exception) { /* the read was cancelled or the pipe closed */ }
        }
        catch (Exception ex) when (ex is IOException or ObjectDisposedException or OperationCanceledException or InvalidDataException or System.Text.Json.JsonException)
        {
            _broker.Withdraw(id, "connection error");
        }
    }

    /// <summary>The claimed agent process must be an ancestor of the pipe client (same pid and creation time).</summary>
    private bool Verify(HookEvent e, int? clientPid)
    {
        if (e.AgentProcess is not { } agent || clientPid is not { } pid) return false;
        try
        {
            foreach (var a in _tree.Ancestors(pid, 16))
                if (a.SameAs(agent) && agent.StartedAtMs != 0) return true;
        }
        catch (Exception ex)
        {
            _log.Debug($"ancestry check failed: {ex.GetType().Name}");
        }
        return false;
    }

    private static async Task<bool> TryWriteAsync(IIngressConnection c, JsonNode frame, CancellationToken ct)
    {
        try
        {
            await c.WriteAsync(frame, ct).ConfigureAwait(false);
            return true;
        }
        catch (Exception ex) when (ex is IOException or ObjectDisposedException or OperationCanceledException or InvalidOperationException)
        {
            return false;
        }
    }
}
