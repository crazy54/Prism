using System.Security.Cryptography;
using PrismControl.Core.Devices;

namespace PrismControl.Smart.Control;

public enum PairingStatus { Pending, Approved, Denied, Expired, Revoked }

/// <summary>One pairing request (an assistant asked to change preferences).</summary>
public sealed record PairingRequest(string Id, string Code, string Client, DateTimeOffset ShownAt, DateTimeOffset ExpiresAt)
{
    public PairingStatus Status { get; internal set; } = PairingStatus.Pending;
    /// <summary>The per-pairing secret (review B3), created at approval. Every operation must present it.</summary>
    internal string? Secret { get; set; }
    /// <summary>The secret goes out once, to the first poll of this request's id after the approval.</summary>
    internal bool SecretDelivered { get; set; }
}

/// <summary>What a Smart Key draws while it is a pairing prompt.</summary>
public sealed record PairPrompt(string Code, double Progress, double SecondsLeft);

/// <summary>Why a pairing could not start.</summary>
public enum PairStartError { None, NoPhysicalKey, RateLimited, Off, Pending }

/// <summary>
/// Pairing an AI assistant with the Smart Deck, approved ON THE DEVICE (Prism Deck's model, prism-deck/src/plugin/control.js
/// + runtime.js onPromptPress):
/// <list type="bullet">
/// <item>a request makes the top-left Smart Key of every connected PHYSICAL deck glow with "ALLOW AI?", a 4-digit code and
/// "hold to allow"; the key never shows the name the assistant gives itself (the PI quotes it);</item>
/// <item>only a HOLD of <see cref="HoldTime"/> (1.5 s) on that key approves; a tap never does, letting go early cancels, and
/// a press that began less than <see cref="PromptGuard"/> after the prompt appeared is ignored;</item>
/// <item>virtual decks (Stream Deck Mobile, the Virtual Stream Deck, the MCP Deck) can never show or approve a prompt:
/// an assistant could press those itself. Only an allow-list of physical LCD decks qualifies;</item>
/// <item>a request expires after <see cref="Ttl"/> (2 min); the PI can deny it or revoke an approval; switching
/// "Allow AI preferences" off revokes everything.</item>
/// </list>
/// Pairing lives in memory only: a plugin restart (new pipe name and token) needs a new approval. Thread-safe.
/// </summary>
public sealed class PairingService : IDisposable
{
    public static readonly TimeSpan Ttl = TimeSpan.FromMinutes(2);
    public static readonly TimeSpan HoldTime = TimeSpan.FromMilliseconds(1500);
    public static readonly TimeSpan PromptGuard = TimeSpan.FromMilliseconds(400);
    public static readonly TimeSpan StartInterval = TimeSpan.FromSeconds(3);

    /// <summary>Decks with real keys a person presses. Mobile (3), Virtual (11), the MCP Deck (14), Studio, pedals and unknown types never qualify.</summary>
    public static readonly IReadOnlySet<DeviceType> PhysicalTypes = new HashSet<DeviceType>
    {
        DeviceType.StreamDeck, DeviceType.Mini, DeviceType.XL, DeviceType.Plus, DeviceType.Neo, DeviceType.Galleon100SD, DeviceType.PlusXL,
    };

    private sealed record KeySlot(string Context, DeviceInfo Device, int X, int Y, Action Invalidate);

    private readonly TimeProvider _time;
    private readonly object _gate = new();
    private readonly Dictionary<string, KeySlot> _keys = new(StringComparer.Ordinal);
    private readonly Dictionary<string, PairingRequest> _requests = new(StringComparer.Ordinal);
    private readonly HashSet<string> _promptContexts = new(StringComparer.Ordinal);
    private PairingRequest? _pending;
    private PairingRequest? _approved;
    /// <summary>When each key became the prompt: the 400 ms guard counts from there, also after the prompt moved keys.</summary>
    private readonly Dictionary<string, DateTimeOffset> _promptSince = new(StringComparer.Ordinal);
    private string? _holdContext;
    private DateTimeOffset _holdStart;
    private ITimer? _holdTimer, _expiryTimer;
    private DateTimeOffset _lastStart = DateTimeOffset.MinValue;

    public PairingService(TimeProvider time) => _time = time;

    /// <summary>Approved, the pending request, the client: changed (any thread). The channel audits it; the PI refreshes.</summary>
    public event Action<string, PairingRequest?>? Changed;

    public bool IsPaired { get; private set; }
    public string? PairedClient { get; private set; }

    public static bool IsPhysical(DeviceInfo d) => PhysicalTypes.Contains(d.Type);

    // ---------------------------------------------------------------- Smart Keys register here

    /// <summary>A Smart Key appeared (any role). Only keys on physical decks can become prompts.</summary>
    public void AddKey(string context, DeviceInfo device, int x, int y, Action invalidate)
    {
        Action? redraw = null;
        lock (_gate)
        {
            _keys[context] = new KeySlot(context, device, x, y, invalidate);
            if (_pending is not null) redraw = RecomputePromptLocked();
        }
        redraw?.Invoke();
    }

    public void RemoveKey(string context)
    {
        Action? redraw = null;
        lock (_gate)
        {
            if (!_keys.Remove(context)) return;
            if (_holdContext == context) CancelHoldLocked();
            if (_pending is not null) redraw = RecomputePromptLocked();
        }
        redraw?.Invoke();
    }

    /// <summary>The top-left Smart Key of each connected physical deck.</summary>
    private HashSet<string> PromptCandidatesLocked() =>
        [.. _keys.Values.Where(k => IsPhysical(k.Device)).GroupBy(k => k.Device.Id)
            .Select(g => g.OrderBy(k => k.Y).ThenBy(k => k.X).First().Context)];

    private Action? RecomputePromptLocked()
    {
        var next = PromptCandidatesLocked();
        if (next.SetEquals(_promptContexts)) return null;
        var touched = _promptContexts.Union(next).Select(c => _keys.TryGetValue(c, out var k) ? k.Invalidate : null).Where(a => a is not null).ToList();
        var now = _time.GetUtcNow();
        foreach (var c in next.Except(_promptContexts)) _promptSince[c] = now;
        foreach (var c in _promptContexts.Except(next)) _promptSince.Remove(c);
        _promptContexts.Clear();
        _promptContexts.UnionWith(next);
        return () => { foreach (var a in touched) a!(); };
    }

    // ---------------------------------------------------------------- requests (from the pipe)

    /// <summary>
    /// Starts a pairing request. <paramref name="client"/> is sanitized to ≤ 64 printable ASCII characters and only ever
    /// shown in the PI. Fails with <see cref="PairStartError.NoPhysicalKey"/> when no physical deck shows a Smart Key,
    /// <see cref="PairStartError.RateLimited"/> within 3 s of the last request, or <see cref="PairStartError.Pending"/>
    /// while another request still waits for the user: a second client can never replace it (or cancel the user's hold).
    /// A new request while paired is allowed (an assistant that lost its secret pairs again); its approval replaces the
    /// old secret.
    /// </summary>
    public (PairingRequest? Request, PairStartError Error, TimeSpan RetryAfter) Start(string? client)
    {
        List<Action> redraw;
        PairingRequest req;
        lock (_gate)
        {
            var now = _time.GetUtcNow();
            if (_pending is { Status: PairingStatus.Pending } waiting && now < waiting.ExpiresAt) return (null, PairStartError.Pending, waiting.ExpiresAt - now);
            if (now - _lastStart < StartInterval) return (null, PairStartError.RateLimited, StartInterval - (now - _lastStart));
            var candidates = PromptCandidatesLocked();
            if (candidates.Count == 0) return (null, PairStartError.NoPhysicalKey, TimeSpan.Zero);
            _lastStart = now;
            if (_pending is not null) _pending.Status = PairingStatus.Expired;
            var code = RandomNumberGenerator.GetInt32(0, 10_000).ToString("D4", System.Globalization.CultureInfo.InvariantCulture);
            req = new PairingRequest(Guid.NewGuid().ToString("N"), code, SanitizeClient(client), now, now + Ttl);
            _pending = req;
            _requests[req.Id] = req;
            while (_requests.Count > 32) _requests.Remove(_requests.Keys.First());
            CancelHoldLocked();
            redraw = [.. _promptContexts.Union(candidates).Select(c => _keys.TryGetValue(c, out var k) ? k.Invalidate : null).Where(a => a is not null).Select(a => a!)];
            _promptContexts.Clear();
            _promptContexts.UnionWith(candidates);
            _promptSince.Clear();
            foreach (var c in candidates) _promptSince[c] = now;
            _expiryTimer?.Dispose();
            _expiryTimer = _time.CreateTimer(_ => Expire(req), null, Ttl, Timeout.InfiniteTimeSpan);
        }
        foreach (var a in redraw) a();
        Changed?.Invoke("pending", req);
        return (req, PairStartError.None, TimeSpan.Zero);
    }

    public PairingRequest? Find(string id)
    {
        PairingRequest? r;
        lock (_gate) if (!_requests.TryGetValue(id, out r)) return null;
        if (r.Status == PairingStatus.Pending && _time.GetUtcNow() >= r.ExpiresAt) Expire(r);
        return r;
    }

    public PairingRequest? Pending
    {
        get
        {
            PairingRequest? p;
            lock (_gate) p = _pending;
            if (p is not null && _time.GetUtcNow() >= p.ExpiresAt) { Expire(p); return null; }
            return p;
        }
    }

    private void Expire(PairingRequest r)
    {
        bool changed;
        List<Action> redraw;
        lock (_gate)
        {
            changed = r.Status == PairingStatus.Pending;
            redraw = changed ? ExpireLocked(r) : [];
        }
        foreach (var a in redraw) a();
        if (changed) Changed?.Invoke("expired", r);
    }

    private List<Action> ExpireLocked(PairingRequest r)
    {
        if (r.Status != PairingStatus.Pending) return [];
        r.Status = PairingStatus.Expired;
        return ClearPromptLocked(r);
    }

    private List<Action> ClearPromptLocked(PairingRequest r)
    {
        if (!ReferenceEquals(_pending, r)) return [];
        _pending = null;
        CancelHoldLocked();
        _expiryTimer?.Dispose();
        _expiryTimer = null;
        var redraw = _promptContexts.Select(c => _keys.TryGetValue(c, out var k) ? k.Invalidate : null).Where(a => a is not null).Select(a => a!).ToList();
        _promptContexts.Clear();
        _promptSince.Clear();
        return redraw;
    }

    // ---------------------------------------------------------------- the PI

    /// <summary>Deny the pending request (PI "Deny"). True when there was one.</summary>
    public bool Deny(string reason = "denied in the property inspector")
    {
        PairingRequest? r;
        List<Action> redraw;
        lock (_gate)
        {
            r = _pending;
            if (r is null || r.Status != PairingStatus.Pending) return false;
            r.Status = PairingStatus.Denied;
            redraw = ClearPromptLocked(r);
        }
        foreach (var a in redraw) a();
        Changed?.Invoke("denied: " + reason, r);
        return true;
    }

    /// <summary>Revoke an approval (PI "Revoke", or "Allow AI preferences" switched off). Also denies a pending request.</summary>
    public bool Revoke(string reason)
    {
        bool was;
        lock (_gate)
        {
            was = IsPaired;
            IsPaired = false;
            PairedClient = null;
            // A revoked pairing never polls "approved" again, and its secret is dead.
            if (_approved is not null) { _approved.Status = PairingStatus.Revoked; _approved.Secret = null; }
            _approved = null;
        }
        var denied = Deny(reason);
        if (was) Changed?.Invoke("revoked: " + reason, null);
        return was || denied;
    }

    // ---------------------------------------------------------------- the deck (only from Smart Key events)

    /// <summary>Whether this Smart Key shows the pairing prompt right now (its presses then belong to pairing).</summary>
    public bool IsPrompt(string context)
    {
        lock (_gate) return _pending is { Status: PairingStatus.Pending } p && _time.GetUtcNow() < p.ExpiresAt && _promptContexts.Contains(context);
    }

    /// <summary>The prompt face for a key (null when it isn't one).</summary>
    public PairPrompt? PromptFor(string context)
    {
        lock (_gate)
        {
            if (_pending is not { Status: PairingStatus.Pending } p || !_promptContexts.Contains(context)) return null;
            var now = _time.GetUtcNow();
            if (now >= p.ExpiresAt) return null;
            var progress = _holdContext == context ? Math.Clamp((now - _holdStart) / HoldTime, 0, 1) : 0;
            return new PairPrompt(p.Code, progress, Math.Max(0, (p.ExpiresAt - now).TotalSeconds));
        }
    }

    /// <summary>
    /// Key down on a prompt key. Starts the 1.5 s hold, but only on a physical deck, only for a press that began at
    /// least 400 ms after the prompt appeared. Returns whether a hold started.
    /// </summary>
    public bool HoldBegin(string context, DeviceInfo device)
    {
        lock (_gate)
        {
            if (!IsPhysical(device)) return false;
            if (_pending is not { Status: PairingStatus.Pending } p || !_promptContexts.Contains(context)) return false;
            var now = _time.GetUtcNow();
            // The guard counts from when THIS key became the prompt (the prompt may have moved here from a key that went away).
            var since = _promptSince.TryGetValue(context, out var at) ? at : p.ShownAt;
            if (now >= p.ExpiresAt || now - since < PromptGuard || now - p.ShownAt < PromptGuard) return false;
            if (!_keys.TryGetValue(context, out var k) || k.Device.Id != device.Id) return false;
            CancelHoldLocked();
            _holdContext = context;
            _holdStart = now;
            var req = p;
            _holdTimer = _time.CreateTimer(_ => HoldReached(context, req), null, HoldTime, Timeout.InfiniteTimeSpan);
            return true;
        }
    }

    /// <summary>Key up: letting go before the ring is full cancels (a tap never approves).</summary>
    public void HoldEnd(string context)
    {
        lock (_gate) if (_holdContext == context) CancelHoldLocked();
    }

    private void CancelHoldLocked()
    {
        _holdTimer?.Dispose();
        _holdTimer = null;
        _holdContext = null;
    }

    private void HoldReached(string context, PairingRequest req)
    {
        var expired = false;
        List<Action> redraw = [];
        lock (_gate)
        {
            if (_holdContext != context || !ReferenceEquals(_pending, req) || req.Status != PairingStatus.Pending) return;
            var now = _time.GetUtcNow();
            if (now >= req.ExpiresAt) expired = true;
            else if (now - _holdStart < HoldTime) return;
            else
            {
                req.Status = PairingStatus.Approved;
                req.Secret = Convert.ToHexString(RandomNumberGenerator.GetBytes(32)).ToLowerInvariant();
                if (_approved is not null && !ReferenceEquals(_approved, req)) { _approved.Status = PairingStatus.Revoked; _approved.Secret = null; }
                _approved = req;
                IsPaired = true;
                PairedClient = req.Client;
                redraw = ClearPromptLocked(req);
            }
        }
        if (expired) { Expire(req); return; }
        foreach (var a in redraw) a();
        Changed?.Invoke("approved", req);
    }

    /// <summary>Whether <paramref name="secret"/> is the current pairing's secret (constant time). Review B3: checked on every operation.</summary>
    public bool IsValidSecret(string? secret)
    {
        string? current;
        lock (_gate) current = IsPaired ? _approved?.Secret : null;
        if (current is null || string.IsNullOrEmpty(secret) || secret.Length != current.Length) return false;
        return CryptographicOperations.FixedTimeEquals(System.Text.Encoding.ASCII.GetBytes(secret), System.Text.Encoding.ASCII.GetBytes(current));
    }

    /// <summary>The secret of an approved request, handed out once (to the first poll of its id after the approval).</summary>
    public string? TakeSecret(PairingRequest r)
    {
        lock (_gate)
        {
            if (r.Status != PairingStatus.Approved || r.Secret is null || r.SecretDelivered || !ReferenceEquals(_approved, r)) return null;
            r.SecretDelivered = true;
            return r.Secret;
        }
    }

    public static string SanitizeClient(string? client)
    {
        var s = new string((client ?? "").Where(c => c is >= ' ' and <= '~').ToArray()).Trim();
        if (s.Length > 64) s = s[..64].TrimEnd();
        return s.Length == 0 ? "AI assistant" : s;
    }

    public void Dispose()
    {
        lock (_gate)
        {
            _holdTimer?.Dispose();
            _expiryTimer?.Dispose();
        }
    }
}
